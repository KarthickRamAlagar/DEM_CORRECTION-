"""
Validate All Feature Files Before Merging

Checks that every features_<year>.tif is actually a valid, readable
GeoTIFF - BEFORE running the expensive merge step (which just wasted
76 minutes on 2022 only to crash on a corrupted 2023 file).

Run: uv run python scripts/validate_feature_files.py
"""

import sys
from pathlib import Path

import rasterio

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_INTERIM

FEATURES_DIR = DATA_INTERIM / "features"
YEARS = range(2022, 2027)


def main():
    print("=" * 60)
    print("VALIDATING ALL FEATURE FILES")
    print("=" * 60)

    bad_years = []

    for year in YEARS:
        path = FEATURES_DIR / f"features_{year}.tif"

        if not path.exists():
            print(f"  {year}: MISSING - {path}")
            bad_years.append(year)
            continue

        try:
            with rasterio.open(path) as src:
                band_count = src.count
                width, height = src.width, src.height
                # actually try reading one full band, not just opening -
                # a truncated file can open but fail on real reads
                _ = src.read(1)
            print(f"  {year}: OK ({band_count} bands, {width}x{height})")
        except Exception as e:
            print(f"  {year}: CORRUPTED - {e}")
            bad_years.append(year)

    print("\n" + "=" * 60)
    if bad_years:
        print(f"PROBLEM: {len(bad_years)} year(s) need to be deleted and recomputed: {bad_years}")
        print("\nRun these commands, then re-run run_features.py:")
        for year in bad_years:
            print(f"  rm -f data/interim/features/features_{year}.tif")
    else:
        print("All 5 years are valid and readable. Safe to run run_merge.py.")
    print("=" * 60)


if __name__ == "__main__":
    main()