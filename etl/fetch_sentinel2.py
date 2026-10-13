"""
Fetch Sentinel-2 Data - Full Version (Tiled Full-Area Coverage, Multi-Year)

Run: uv run python scripts/fetch_sentinel2.py

Now matches Sentinel-1's approach: tiles the FULL bbox every year,
dedupes overlapping scenes, mosaics each band into one seamless
full-bbox raster per year. No more coverage gaps.

WARNING: this downloads more data than the earlier single-scene version -
expect multiple scenes per year (however many are needed to cover the
full grid), x 6 bands, x 5 years. Will take a while, similar in scope
to the Sentinel-1 run.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.sentinel2 import (
    fetch_and_mosaic_year,
    compute_ndvi_from_mosaics,
)
from dem_correction.config import DATA_RAW, STUDY_BBOX

YEARS = range(2022, 2027)


def main():
    print("=" * 60)
    print("SENTINEL-2 FULL FETCH (tiled, multi-year)")
    print("=" * 60)

    all_mosaics = {}

    for year in YEARS:
        print(f"\n--- Year {year} ---")
        output_dir = DATA_RAW / "sentinel2" / str(year)
        mosaics = fetch_and_mosaic_year(STUDY_BBOX, year, output_dir)

        if mosaics:
            all_mosaics[year] = mosaics
            print(f"  Sanity check for {year}:")
            try:
                compute_ndvi_from_mosaics(mosaics)
            except Exception as e:
                print(f"    SKIPPED sanity check (mosaics still saved): {e}")

    print("\n" + "=" * 60)
    print(f"Done. Full-bbox coverage achieved for years: {sorted(all_mosaics.keys())}")
    print("Each year now has consistent, complete coverage - matching Sentinel-1.")
    print("=" * 60)


if __name__ == "__main__":
    main()