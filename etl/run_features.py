"""
Run Feature Engineering (Stage 8)

Computes all features (topographic, optical, SAR, neighborhood) for
each year, from the aligned rasters produced by run_reproject.py.
Saves one multi-band GeoTIFF per year with named bands.

Run: uv run python scripts/run_features.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.processing.features import compute_all_features_for_year
from dem_correction.config import DATA_INTERIM, DATA_FINAL

ALIGNED_DIR = DATA_INTERIM / "aligned"
FEATURES_DIR = DATA_INTERIM / "features"
MERGED_BY_YEAR_DIR = DATA_FINAL / "merged_by_year"

YEARS = range(2022, 2027)
S2_BANDS = ["B02", "B03", "B04", "B08", "B11", "B12"]

# DEM is static (doesn't change per year) - use CartoDEM as primary
DEM_PATH = ALIGNED_DIR / "cartodem_aligned.tif"


def main():
    print("=" * 60)
    print("FEATURE ENGINEERING - ALL YEARS")
    print("=" * 60)

    if not DEM_PATH.exists():
        print(f"ERROR: DEM not found at {DEM_PATH}. Run run_reproject.py first.")
        return

    for year in YEARS:
        print(f"\n--- Year {year} ---")

        s1_path = ALIGNED_DIR / "sentinel1" / f"s1_{year}_aligned.tif"
        s2_paths = {
            band: ALIGNED_DIR / "sentinel2" / f"s2_{year}_{band}_aligned.tif"
            for band in S2_BANDS
        }

        if not s1_path.exists():
            print(f"  SKIPPED: Sentinel-1 data not found for {year}")
            continue
        if not all(p.exists() for p in s2_paths.values()):
            print(f"  SKIPPED: Sentinel-2 data incomplete for {year}")
            continue

        output_path = FEATURES_DIR / f"features_{year}.tif"
        merge_checkpoint = MERGED_BY_YEAR_DIR / f"merged_{year}.parquet"

        if merge_checkpoint.exists():
            print(f"  Already merged (checkpoint exists), skipping - "
                  f"raw feature file not needed anymore even if deleted "
                  f"for disk space: {merge_checkpoint.name}")
            continue
        if output_path.exists():
            print(f"  Already computed, skipping: {output_path.name}")
            continue

        print(f"  Computing features from DEM + Sentinel-1 + Sentinel-2 (strip-by-strip)...")
        compute_all_features_for_year(DEM_PATH, s1_path, s2_paths, output_path)

    print("\n" + "=" * 60)
    print("Done. Feature rasters saved per year in data/interim/features/")
    print("Ready to proceed to merge.py")
    print("=" * 60)
    


if __name__ == "__main__":
    main()