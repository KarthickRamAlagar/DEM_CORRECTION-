"""
Run Merge (Stage 9) - Produces the Final Integrated Dataset

This is the script that produces YOUR ACTUAL DELIVERABLE: one row per
ICESat-2 point, ~50+ feature columns, target columns included.

Run: uv run python scripts/run_merge.py
"""

import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.processing.merge import (
    load_all_icesat2_points,
    assign_matched_year,
    sample_features_at_points,
    get_environmental_cached,
    compute_target_columns,
    AVAILABLE_FEATURE_YEARS,
)
from dem_correction.config import DATA_FINAL

OUTPUT_PATH = DATA_FINAL / "integrated_dataset.parquet"


def main():
    print("=" * 60)
    print("MERGE - BUILDING FINAL INTEGRATED DATASET")
    print("=" * 60)

    # Step 1: Load all ICESat-2 points
    points = load_all_icesat2_points()

    # Step 2: Assign each point to its nearest available feature year
    print("\nAssigning nearest-year matches...")
    points = assign_matched_year(points)
    print("  Year distribution:")
    print(points["year_matched"].value_counts().sort_index().to_string())

    # Step 3: Sample raster features per year (batched - much faster
    # than one point at a time)
    print("\nSampling features from rasters (grouped by year)...")
    all_year_dfs = []
    MERGED_BY_YEAR_DIR = DATA_FINAL / "merged_by_year"
    MERGED_BY_YEAR_DIR.mkdir(parents=True, exist_ok=True)

    for year in AVAILABLE_FEATURE_YEARS:
        year_points = points[points["year_matched"] == year]
        if len(year_points) == 0:
            continue

        checkpoint_path = MERGED_BY_YEAR_DIR / f"merged_{year}.parquet"
        if checkpoint_path.exists():
            print(f"  Year {year}: already sampled, loading checkpoint ({checkpoint_path.name})...")
            combined = pd.read_parquet(checkpoint_path)
            all_year_dfs.append(combined)
            continue

        print(f"  Year {year}: sampling {len(year_points):,} points...")
        start = time.time()
        feature_df = sample_features_at_points(year_points, year)
        elapsed = time.time() - start
        print(f"    Done in {elapsed/60:.1f} min")

        combined = pd.concat(
            [year_points.reset_index(drop=True), feature_df.reset_index(drop=True)],
            axis=1,
        )

        # CHECKPOINT: save this year's result immediately, so a crash
        # later (e.g., during a different year, or environmental
        # lookups) doesn't lose this completed work
        combined.to_parquet(checkpoint_path, index=False)
        print(f"    Checkpoint saved: {checkpoint_path}")

        all_year_dfs.append(combined)

    full_df = pd.concat(all_year_dfs, ignore_index=True)
    print(f"\nTotal points with features sampled: {len(full_df):,}")

    # Step 4: Environmental data (cached by date, see merge.py docstring
    # for why point-level lookups aren't feasible at this scale)
    print("\nFetching environmental data (cached by date)...")
    full_df["date_str"] = full_df["source_year"].astype(str) + "0115"  # approximate mid-month
    env_cache = {}
    unique_dates = full_df["date_str"].unique()
    print(f"  {len(unique_dates)} unique date(s) to look up (not {len(full_df):,} - caching keeps this fast)")

    for date_str in unique_dates:
        get_environmental_cached(date_str, env_cache)

    full_df["relative_humidity_pct"] = full_df["date_str"].map(
        lambda d: env_cache[d]["relative_humidity_pct"]
    )
    full_df["atmospheric_pressure_kpa"] = full_df["date_str"].map(
        lambda d: env_cache[d]["atmospheric_pressure_kpa"]
    )

    # Step 5: Compute target columns
    print("\nComputing target columns...")
    full_df = compute_target_columns(full_df)

    # Step 6: Save
    print(f"\nSaving final dataset...")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    full_df.to_parquet(OUTPUT_PATH, index=False)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    print(f"Final dataset: {OUTPUT_PATH}")
    print(f"Rows: {len(full_df):,}")
    print(f"Columns: {len(full_df.columns)}")
    print(f"Column names: {list(full_df.columns)}")


if __name__ == "__main__":
    main()