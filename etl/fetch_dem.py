"""
Fetch DEM Data - Orchestration Script

Run: uv run python scripts/fetch_dem.py

BEFORE RUNNING: manually copy your 12 downloaded CartoDEM .tif files
into data/raw/dem/cartodem_tiles/
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.dem import (
    mosaic_cartodem,
    search_copernicus_dem,
    download_copernicus_dem,
    mosaic_copernicus_dem,
)
from dem_correction.config import DATA_RAW, DATA_INTERIM

CARTODEM_TILE_DIR = DATA_RAW / "dem" / "cartodem_tiles"
CARTODEM_MOSAIC_OUT = DATA_INTERIM / "cartodem_mosaic.tif"

COPDEM_TILE_DIR = DATA_RAW / "dem" / "copernicus_tiles"
COPDEM_MOSAIC_OUT = DATA_INTERIM / "copernicus_dem_mosaic.tif"


def main():
    print("=" * 60)
    print("DEM FETCH: CartoDEM mosaic + Copernicus DEM")
    print("=" * 60)

    # Part 1: Mosaic your local CartoDEM tiles
    print("\n--- CartoDEM (primary baseline) ---")
    if CARTODEM_TILE_DIR.exists() and list(CARTODEM_TILE_DIR.glob("*.tif")):
        mosaic_cartodem(CARTODEM_TILE_DIR, CARTODEM_MOSAIC_OUT)
    else:
        print(f"No tiles found in {CARTODEM_TILE_DIR}")
        print("Copy your 12 downloaded .tif files there first, then re-run.")

    # Part 2: Pull Copernicus DEM (secondary baseline)
    print("\n--- Copernicus DEM GLO-30 (secondary baseline) ---")
    items = search_copernicus_dem()
    if items:
        tile_paths = download_copernicus_dem(items, COPDEM_TILE_DIR)
        mosaic_copernicus_dem(tile_paths, COPDEM_MOSAIC_OUT)

    print("\nDone.")


if __name__ == "__main__":
    main()