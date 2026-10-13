"""
DEM Fetcher

Two responsibilities:
1. Mosaic your 12 already-downloaded CartoDEM tiles into one seamless raster.
2. Pull Copernicus DEM GLO-30 via Planetary Computer (secondary baseline) -
   no auth needed.
"""

from pathlib import Path

import planetary_computer
import requests
import rasterio
from rasterio.merge import merge
from pystac_client import Client

from dem_correction.config import STUDY_BBOX, DATA_RAW

PC_CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"


def mosaic_cartodem(tile_dir, output_path):
    """
    Merge all local CartoDEM .tif tiles in tile_dir into one seamless raster.
    Assumes you've manually placed your 12 downloaded tiles in tile_dir.
    """
    tile_dir = Path(tile_dir)
    tile_files = sorted(tile_dir.glob("*.tif"))

    if not tile_files:
        raise FileNotFoundError(
            f"No .tif files found in {tile_dir}. "
            f"Place your 12 downloaded CartoDEM tiles there first."
        )

    print(f"Mosaicking {len(tile_files)} CartoDEM tiles...")
    for f in tile_files:
        print(f"  {f.name}")

    src_files = [rasterio.open(f) for f in tile_files]
    mosaic, out_transform = merge(src_files)

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
    print(f"  Shape: {mosaic.shape}")
    return output_path


def search_copernicus_dem(bbox=STUDY_BBOX):
    """Search Copernicus DEM GLO-30 tiles covering the study bbox."""
    catalog = Client.open(PC_CATALOG_URL)
    search = catalog.search(collections=["cop-dem-glo-30"], bbox=bbox)
    items = list(search.items())
    print(f"Found {len(items)} Copernicus DEM tiles covering the study bbox.")
    return items


def download_copernicus_dem(items, output_dir):
    """Download each Copernicus DEM tile (signed URLs, no auth needed)."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded = []
    for item in items:
        signed_item = planetary_computer.sign(item)
        asset_href = signed_item.assets["data"].href

        out_path = output_dir / f"{item.id}.tif"
        if out_path.exists():
            print(f"  Already downloaded: {out_path.name}")
            downloaded.append(out_path)
            continue

        print(f"  Downloading: {item.id}")
        response = requests.get(asset_href, stream=True)
        response.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
        downloaded.append(out_path)

    print(f"Downloaded {len(downloaded)} Copernicus DEM tiles.")
    return downloaded


def mosaic_copernicus_dem(tile_paths, output_path):
    """Merge downloaded Copernicus DEM tiles into one seamless raster."""
    print(f"Mosaicking {len(tile_paths)} Copernicus DEM tiles...")
    src_files = [rasterio.open(f) for f in tile_paths]
    mosaic, out_transform = merge(src_files)

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