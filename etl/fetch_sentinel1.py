"""
Fetch Sentinel-1 Data - Full Version (Multi-Year + Tiled Full Coverage)

Run: uv run python scripts/fetch_sentinel1.py

WARNING: this is a much bigger job than the earlier test version.
With TILE_SIZE_DEG=0.5 over the full 4deg x 3deg study bbox, expect
roughly 48 tiles PER YEAR x 5 years = up to ~240 individual downloads.
This will take a while - similar in spirit to the ICESat-2 fetch,
though each individual file is much smaller.

Safe to stop and restart: already-downloaded tiles are skipped.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.sentinel1 import (
    find_representative_date_per_year,
    download_full_area_for_date,
    mosaic_tiles,
)
from dem_correction.config import DATA_RAW, STUDY_BBOX

YEARS = range(2022, 2027)


def main():
    print("=" * 60)
    print("SENTINEL-1 FULL FETCH (multi-year, tiled)")
    print("=" * 60)

    print("\n--- Coherence / SLC status (unchanged decision) ---")
    print("Interferometric coherence remains dropped from the feature set.")
    print("VV, VH, and derived features are fully covered by this fetch.\n")

    print("--- Step 1: Find one representative date per year ---")
    dates_by_year = find_representative_date_per_year(YEARS, bbox=STUDY_BBOX)

    if not dates_by_year:
        print("No dates found for any year. Check bbox/date range.")
        return

    for year, date in dates_by_year.items():
        print(f"\n--- Year {year}: downloading full-area tiles for {date} ---")
        tile_dir = DATA_RAW / "sentinel1" / str(year) / "tiles"
        tile_paths = download_full_area_for_date(STUDY_BBOX, date, tile_dir)

        if tile_paths:
            mosaic_path = DATA_RAW / "sentinel1" / str(year) / f"s1_vv_vh_{year}_mosaic.tif"
            mosaic_tiles(tile_paths, mosaic_path)
        else:
            print(f"  No tiles downloaded successfully for {year}.")

    print("\nDone. One VV/VH mosaic per year saved under data/raw/sentinel1/<year>/")


if __name__ == "__main__":
    main()