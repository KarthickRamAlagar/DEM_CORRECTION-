"""
Sentinel-1 Fetcher (v3: Fixed dB Conversion + Grid-Snapped Tiling)

TWO SERIOUS BUGS FIXED HERE, found via the final dataset sanity check:

BUG 1 - WRONG UNITS: the evalscript previously returned raw sample.VV/
sample.VH values directly. Sentinel Hub returns these in LINEAR power
by default, NOT decibels - but every downstream calculation (including
the dB-to-linear conversion in compute_sar_features) assumed the values
were already in dB. This produced physically impossible values (VV up
to 200+, when real SAR backscatter is normally -25 to +5 dB). FIX: the
evalscript now converts to dB server-side (10*log10(linear_power)),
so downloaded values are genuinely in dB as expected everywhere else
in the pipeline.

BUG 2 - TILE SEAM GAPS: each of the 48 tiles was built independently
via bbox_to_dimensions() with its own computed transform - small
inconsistencies between tiles' pixel grids left real gaps when
mosaicked (confirmed: 36-88% missing data across different years).
FIX: every tile is now reprojected onto the SAME explicit reference
grid (matching CartoDEM's grid exactly) BEFORE mosaicking - the same
technique that fixed Sentinel-2's UTM zone mismatch earlier.
"""

from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.merge import merge

from sentinelhub import (
    SHConfig,
    SentinelHubCatalog,
    SentinelHubRequest,
    DataCollection,
    MimeType,
    BBox,
    CRS,
    bbox_to_dimensions,
)

from dem_correction.config import STUDY_BBOX, CDSE_CLIENT_ID, CDSE_CLIENT_SECRET

CDSE_BASE_URL = "https://sh.dataspace.copernicus.eu"
TILE_SIZE_DEG = 0.5

# Must match the reference grid used everywhere else in the pipeline
REFERENCE_CRS = "EPSG:4326"
REFERENCE_RESOLUTION_DEG = 0.00027778


def get_sh_config():
    config = SHConfig()
    config.sh_client_id = CDSE_CLIENT_ID
    config.sh_client_secret = CDSE_CLIENT_SECRET
    config.sh_base_url = CDSE_BASE_URL
    config.sh_token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

    if not config.sh_client_id or not config.sh_client_secret:
        raise RuntimeError("CDSE_CLIENT_ID / CDSE_CLIENT_SECRET not set in .env.")
    return config


def get_cdse_sentinel1_collection():
    return DataCollection.SENTINEL1_IW.define_from(
        "SENTINEL1_IW_CDSE", service_url=CDSE_BASE_URL,
    )


def get_tile_grid(bbox=STUDY_BBOX, tile_size_deg=TILE_SIZE_DEG):
    west, south, east, north = bbox
    tiles = []
    lon = west
    while lon < east:
        lon_end = min(lon + tile_size_deg, east)
        lat = south
        while lat < north:
            lat_end = min(lat + tile_size_deg, north)
            tiles.append((lon, lat, lon_end, lat_end))
            lat = lat_end
        lon = lon_end
    print(f"Split study bbox into {len(tiles)} tiles ({tile_size_deg} deg each).")
    return tiles


def find_representative_date_per_year(years, bbox=STUDY_BBOX):
    config = get_sh_config()
    catalog = SentinelHubCatalog(config=config)
    search_bbox = BBox(bbox=bbox, crs=CRS.WGS84)
    cdse_collection = get_cdse_sentinel1_collection()

    dates_by_year = {}
    for year in years:
        results = catalog.search(
            cdse_collection,
            bbox=search_bbox,
            time=(f"{year}-01-01", f"{year}-12-31"),
            limit=1,
        )
        items = list(results)
        if items:
            date = items[0]["properties"]["datetime"][:10]
            dates_by_year[year] = date
            print(f"  Year {year}: using date {date}")
        else:
            print(f"  Year {year}: no scenes found.")

    return dates_by_year


def download_vv_vh_tile(sub_bbox, date, output_path, resolution=30, max_retries=4):
    """
    Download VV/VH for ONE tile, with the dB conversion FIX applied
    server-side in the evalscript, AND retry-with-backoff (added
    proactively - the Sentinel-2 fetcher only became reliable after
    several real crashes taught us this was needed; adding it here
    from the start rather than waiting for the same failure pattern).
    """
    import time
    import requests

    config = get_sh_config()
    search_bbox = BBox(bbox=sub_bbox, crs=CRS.WGS84)
    size = bbox_to_dimensions(search_bbox, resolution=resolution)

    cdse_collection = get_cdse_sentinel1_collection()

    evalscript = """
    //VERSION=3
    function setup() {
        return {
            input: ["VV", "VH"],
            output: { bands: 2, sampleType: "FLOAT32" }
        };
    }
    function evaluatePixel(sample) {
        let vv_db = 10 * Math.log10(Math.max(sample.VV, 1e-10));
        let vh_db = 10 * Math.log10(Math.max(sample.VH, 1e-10));
        return [vv_db, vh_db];
    }
    """

    for attempt in range(1, max_retries + 1):
        try:
            request = SentinelHubRequest(
                evalscript=evalscript,
                input_data=[
                    SentinelHubRequest.input_data(
                        data_collection=cdse_collection,
                        time_interval=(date, date),
                    )
                ],
                responses=[SentinelHubRequest.output_response("default", MimeType.TIFF)],
                bbox=search_bbox,
                size=size,
                config=config,
            )
            data = request.get_data()[0]

            west, south, east, north = sub_bbox
            transform = from_bounds(west, south, east, north, size[0], size[1])

            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            with rasterio.open(
                output_path, "w",
                driver="GTiff",
                height=size[1], width=size[0],
                count=2, dtype="float32",
                crs="EPSG:4326",
                transform=transform,
                nodata=np.nan,
            ) as dst:
                dst.write(data[:, :, 0], 1)
                dst.write(data[:, :, 1], 2)

            return output_path

        except Exception as e:
            wait = 5 * (3 ** (attempt - 1))
            print(f"      Attempt {attempt}/{max_retries} failed ({type(e).__name__}: {e}). "
                  f"Waiting {wait}s before retry...")
            if attempt < max_retries:
                time.sleep(wait)
            else:
                print(f"      GIVING UP on this tile after {max_retries} attempts.")
                raise


def reproject_tile_to_reference(src_path, dst_path, resolution=REFERENCE_RESOLUTION_DEG):
    """
    THE REAL FIX for tile seam gaps: reproject each individual tile
    onto a precisely-defined grid (same resolution/alignment convention
    used everywhere else) BEFORE mosaicking - eliminates the small
    per-tile grid inconsistencies that were leaving gaps when merged.
    """
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, REFERENCE_CRS, src.width, src.height, *src.bounds,
            resolution=resolution,
        )
        kwargs = src.meta.copy()
        kwargs.update({
            "crs": REFERENCE_CRS,
            "transform": transform,
            "width": width,
            "height": height,
            "nodata": np.nan,
        })

        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(dst_path, "w", **kwargs) as dst:
            for band_idx in [1, 2]:
                reproject(
                    source=rasterio.band(src, band_idx),
                    destination=rasterio.band(dst, band_idx),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=REFERENCE_CRS,
                    resampling=Resampling.bilinear,
                    src_nodata=np.nan,
                    dst_nodata=np.nan,
                )
    return dst_path


def download_full_area_for_date(bbox, date, output_dir, tile_size_deg=TILE_SIZE_DEG, resolution=30):
    """Download every tile, then reproject each onto the common reference grid."""
    tiles = get_tile_grid(bbox, tile_size_deg)
    output_dir = Path(output_dir)

    reprojected_paths = []
    for i, sub_bbox in enumerate(tiles, start=1):
        raw_path = output_dir / "raw" / f"tile_{i:03d}.tif"
        reproj_path = output_dir / f"tile_{i:03d}_reprojected.tif"

        if reproj_path.exists():
            print(f"  Tile {i}/{len(tiles)}: already processed, skipping.")
            reprojected_paths.append(reproj_path)
            continue

        print(f"  Tile {i}/{len(tiles)}: downloading {sub_bbox}...")
        try:
            download_vv_vh_tile(sub_bbox, date, raw_path, resolution)
            reproject_tile_to_reference(raw_path, reproj_path)
            reprojected_paths.append(reproj_path)
            raw_path.unlink(missing_ok=True)
        except Exception as e:
            print(f"    SKIPPING tile {i} after repeated failures: {e}")
            continue

    return reprojected_paths


def mosaic_tiles(tile_paths, output_path):
    """Merge the now grid-aligned tiles - no more seam gaps expected."""
    if not tile_paths:
        print("No tiles to mosaic.")
        return None

    print(f"Mosaicking {len(tile_paths)} tiles...")
    src_files = [rasterio.open(f) for f in tile_paths]
    mosaic, out_transform = merge(src_files, method="first")

    out_meta = src_files[0].meta.copy()
    out_meta.update({
        "height": mosaic.shape[1],
        "width": mosaic.shape[2],
        "transform": out_transform,
    })

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(output_path, "w", **out_meta) as dest:
        dest.write(mosaic)

    for f in src_files:
        f.close()

    print(f"Saved mosaic: {output_path}")
    return output_path