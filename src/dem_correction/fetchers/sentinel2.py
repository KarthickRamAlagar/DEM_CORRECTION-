"""
Sentinel-2 L2A Fetcher (Full Version: Tiled Full-Area Coverage, Multi-Year)

UPGRADED to match Sentinel-1's approach: instead of grabbing one "best"
scene per year (which could land on any UTM tile in the region, leaving
gaps), this tiles the FULL bbox every year, like Sentinel-1 does.

One adaptation from Sentinel-1's approach: Sentinel-2 scenes are real
satellite tiles (~110km each) downloaded directly from Planetary
Computer - there's no Process API pixel limit here. So instead of
downloading pixel-array tiles, this searches for the least-cloudy scene
covering EACH sub-tile of the grid, then DEDUPES by scene ID (since one
real Sentinel-2 scene often covers multiple grid sub-tiles) before
downloading - avoiding redundant downloads of the same scene.

After downloading, all scenes for a year are mosaicked per band into
one seamless full-bbox raster per band, per year.
"""

from pathlib import Path

import planetary_computer
import requests
import rasterio
import numpy as np
from rasterio.merge import merge
from pystac_client import Client

from dem_correction.config import STUDY_BBOX

PC_CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
BANDS_NEEDED = ["B02", "B03", "B04", "B08", "B11", "B12"]
TILE_SIZE_DEG = 0.5  # same grid size as Sentinel-1, for consistency


def get_tile_grid(bbox=STUDY_BBOX, tile_size_deg=TILE_SIZE_DEG):
    """Same tiling logic as Sentinel-1 - split bbox into a grid of sub-bboxes."""
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
    return tiles


def find_covering_scenes_for_year(bbox, year, tile_size_deg=TILE_SIZE_DEG, max_cloud_cover=20):
    """
    For one year, find the least-cloudy scene covering EACH grid tile,
    then dedupe by scene ID (one real scene often covers several grid
    tiles, so this avoids downloading the same scene multiple times).
    """
    catalog = Client.open(PC_CATALOG_URL)
    tiles = get_tile_grid(bbox, tile_size_deg)

    print(f"  Year {year}: searching {len(tiles)} grid tiles...")
    unique_scenes = {}  # item.id -> item

    for sub_bbox in tiles:
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=sub_bbox,
            datetime=f"{year}-01-01/{year}-12-31",
            query={"eo:cloud_cover": {"lt": max_cloud_cover}},
            max_items=5,
        )
        items = list(search.items())
        if not items:
            continue
        items.sort(key=lambda i: i.properties.get("eo:cloud_cover", 100))
        best = items[0]
        unique_scenes[best.id] = best

    print(f"  Year {year}: {len(unique_scenes)} unique scenes cover the grid "
          f"(deduped from {len(tiles)} tile searches).")
    return list(unique_scenes.values())


def download_one_band(item, band, out_path, max_retries=4):
    """
    Download one band file, with retry-with-backoff on rate limits (403),
    network timeouts, and connection errors.

    FIX (from real 2026 failure): the URL is now re-signed FRESH on
    EVERY retry attempt, not just once before the retry loop. Previously,
    a signed URL was reused across all 4 attempts - with exponential
    backoff waiting up to 135 seconds between tries, the signature could
    go stale mid-retry, turning a temporary network hiccup (attempt 1)
    into a permanent 403 failure by attempt 3-4, even though the
    underlying network issue may have already cleared up.
    """
    import time

    tmp_path = Path(str(out_path) + ".partial")

    for attempt in range(1, max_retries + 1):
        try:
            # re-sign fresh on EVERY attempt, not just once before the loop
            signed_item = planetary_computer.sign(item)
            if band not in signed_item.assets:
                return False
            href = signed_item.assets[band].href

            response = requests.get(href, stream=True, timeout=60)
            response.raise_for_status()
            with open(tmp_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
            tmp_path.rename(out_path)
            return True
        except requests.exceptions.RequestException as e:
            wait = 5 * (3 ** (attempt - 1))  # 5, 15, 45, 135 seconds
            print(f"      Attempt {attempt}/{max_retries} failed ({type(e).__name__}: {e}). "
                  f"Waiting {wait}s before retry (will re-sign fresh URL)...")
            tmp_path.unlink(missing_ok=True)
            if attempt < max_retries:
                time.sleep(wait)
            else:
                print(f"      GIVING UP on this band after {max_retries} attempts.")
                return False
    return False


def is_valid_geotiff(path):
    """
    THOROUGH check - reads the entire band to catch corruption anywhere
    in the file. Correct, but slow across many large files. Use this
    only in the standalone clean_corrupted_tifs.py script (run manually,
    occasionally) - NOT on every file during normal fetch runs, since
    that made every resume take hours re-validating hundreds of already-
    good files.
    """
    try:
        with rasterio.open(path) as src:
            _ = src.read(1)
        return True
    except Exception:
        return False


def looks_downloaded(path, min_size_bytes=1_000_000):
    """
    FAST check for normal fetch runs - just confirms the file exists
    and isn't suspiciously tiny (a truncated download is usually much
    smaller than a real ~50-200MB band file). This is a cheap filesystem
    check, not a full file read - fast even across hundreds of files.

    This is NOT as thorough as is_valid_geotiff() - it won't catch every
    possible corruption (like the mid-file truncation found earlier).
    That's an intentional tradeoff: run clean_corrupted_tifs.py
    occasionally (e.g., after any crash) for the thorough check, and use
    this fast check for routine "should I skip re-downloading this"
    decisions so normal runs stay fast.
    """
    return path.exists() and path.stat().st_size > min_size_bytes


def download_bands(item, output_dir, bands=BANDS_NEEDED, pause_between_bands=1.5):
    """
    Download the needed bands for one Sentinel-2 scene.

    Uses the FAST existence+size check (looks_downloaded) for routine
    skip decisions, not the slow full-read check - that was the real
    cause of runs taking hours to "resume" across hundreds of files.
    """
    import time

    output_dir = Path(output_dir) / item.id
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded = {}

    for band in bands:
        out_path = output_dir / f"{band}.tif"

        if looks_downloaded(out_path):
            downloaded[band] = out_path
            continue
        elif out_path.exists():
            print(f"    {band}: existing file looks too small/incomplete, re-downloading...")
            out_path.unlink()

        success = download_one_band(item, band, out_path)
        if success:
            downloaded[band] = out_path

        time.sleep(pause_between_bands)

    return downloaded


def reproject_to_common_grid(src_path, dst_path, target_crs="EPSG:4326", target_resolution=0.00027778):
    """
    Reproject one band to a common CRS and resolution BEFORE mosaicking.

    THIS IS THE REAL FIX for two problems together:
    1. UTM zone mismatch - your bbox straddles the Zone 44N/45N boundary
       (confirmed: scenes T44R... vs T45RTK/T45RTL in your 2022 run).
       rasterio.merge does NOT reproject automatically - it assumes all
       inputs already share one CRS. Mixing zones without this step
       would silently misalign the mosaic in the overlap region.
    2. Memory - downsamples from native 10m to 30m (matching CartoDEM's
       resolution and CRS), cutting memory ~9x versus the native-resolution
       merge that crashed at 5.79 GiB for one band.
    """
    from rasterio.warp import calculate_default_transform, reproject, Resampling

    with rasterio.open(src_path) as src:
        if src.crs == target_crs:
            # still need the resolution downsample even if CRS already matches
            pass

        transform, width, height = calculate_default_transform(
            src.crs, target_crs, src.width, src.height, *src.bounds,
            resolution=target_resolution,
        )
        kwargs = src.meta.copy()
        kwargs.update({
            "crs": target_crs,
            "transform": transform,
            "width": width,
            "height": height,
        })

        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(dst_path, "w", **kwargs) as dst:
            reproject(
                source=rasterio.band(src, 1),
                destination=rasterio.band(dst, 1),
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=target_crs,
                resampling=Resampling.bilinear,
            )

    return dst_path


def mosaic_band_across_scenes(band_paths_list, output_path, bbox=STUDY_BBOX, target_resolution_deg=0.00027778):
    """
    Mosaic one band across all scenes covering the bbox for a year.

    Reprojects every input scene to a common WGS84 30m grid FIRST
    (fixes the UTM zone mismatch AND the memory crash together), then
    merges the now-consistent files, clipped to the study bbox.
    """
    target_crs = "EPSG:4326"

    reprojected_paths = []
    for src_path in band_paths_list:
        reproj_path = Path(src_path).parent / f"reprojected_{Path(src_path).name}"
        if not reproj_path.exists():
            reproject_to_common_grid(src_path, reproj_path, target_crs, target_resolution_deg)
        reprojected_paths.append(reproj_path)

    src_files = [rasterio.open(p) for p in reprojected_paths]

    mosaic, out_transform = merge(src_files, bounds=bbox)

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

    return output_path


def fetch_and_mosaic_year(bbox, year, output_dir, bands=BANDS_NEEDED, max_cloud_cover=20):
    """
    Full pipeline for one year: find covering scenes, download bands,
    mosaic each band into one full-bbox raster.
    Returns dict: {band_name: mosaic_path}
    """
    scenes = find_covering_scenes_for_year(bbox, year, max_cloud_cover=max_cloud_cover)
    if not scenes:
        print(f"  Year {year}: no scenes found, skipping.")
        return {}

    print(f"  Year {year}: downloading bands for {len(scenes)} scenes...")
    scene_band_paths = {}  # band -> list of paths across scenes
    for band in bands:
        scene_band_paths[band] = []

    for i, item in enumerate(scenes, start=1):
        print(f"    Scene {i}/{len(scenes)}: {item.id}")
        downloaded = download_bands(item, output_dir, bands)
        for band, path in downloaded.items():
            scene_band_paths[band].append(path)

    print(f"  Year {year}: mosaicking each band across {len(scenes)} scenes...")
    mosaics = {}
    for band, paths in scene_band_paths.items():
        if not paths:
            continue
        mosaic_path = Path(output_dir) / f"{year}_{band}_mosaic.tif"
        mosaic_band_across_scenes(paths, mosaic_path)
        mosaics[band] = mosaic_path
        print(f"    {band}: mosaicked {len(paths)} scene(s) -> {mosaic_path.name}")

    return mosaics


def compute_ndvi_from_mosaics(mosaics):
    """Sanity check on the final mosaicked bands for a year."""
    if "B04" not in mosaics or "B08" not in mosaics:
        print("    Missing B04 or B08 mosaic, skipping NDVI check.")
        return None

    with rasterio.open(mosaics["B04"]) as red_src:
        red = red_src.read(1).astype(np.float32)
    with rasterio.open(mosaics["B08"]) as nir_src:
        nir = nir_src.read(1).astype(np.float32)

    if red.shape != nir.shape:
        print(f"    NOTE: shape mismatch {red.shape} vs {nir.shape} - "
              f"full reprojection needed at Step 7.")
        return None

    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / (nir + red)
        ndvi = np.nan_to_num(ndvi, nan=0.0)

    print(f"    NDVI range: {ndvi.min():.3f} to {ndvi.max():.3f}, mean: {ndvi.mean():.3f}")
    del red, nir
    return ndvi


def find_nearest_year(target_year, available_years):
    """For merge time - match an ICESat-2 point's year to nearest available."""
    available_years = sorted(available_years)
    return min(available_years, key=lambda y: abs(y - target_year))