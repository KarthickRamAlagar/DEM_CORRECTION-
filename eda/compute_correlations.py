"""
Precompute Correlations - Step 4 of the EDA Page Plan

Two outputs:
1. One correlation matrix PER GROUP (matches the dropdown structure -
   smaller, more readable than one giant 55x55 matrix)
2. One simple table: every feature's correlation with the target
   (elevation_error_signed) - a quick-scan summary before looking at
   individual scatter plots in Step 5

Run: uv run python eda/compute_correlations.py
"""

import sys
import json
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent))

from dem_correction.config import DATA_FINAL
from feature_dictionary import FEATURE_DICTIONARY, get_all_group_keys, get_features_by_group

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
OUTPUT_DIR = Path(__file__).parent / "precomputed"
TARGET_COLUMN = "elevation_error_signed"


def main():
    print("=" * 60)
    print("PRECOMPUTING CORRELATIONS")
    print("=" * 60)

    feature_cols = list(FEATURE_DICTIONARY.keys())
    df = pd.read_parquet(DATASET_PATH, columns=feature_cols)
    print(f"Loaded {len(df):,} rows, {len(feature_cols)} features")

    # --- Part 1: per-group correlation matrices ---
    print("\nComputing per-group correlation matrices...")
    group_correlations = {}
    for group_key in get_all_group_keys():
        group_features = list(get_features_by_group(group_key).keys())
        if len(group_features) < 2:
            continue
        # pandas .corr() uses pairwise-complete-observations by default,
        # so this handles the SAR columns' missing values correctly
        corr_matrix = df[group_features].corr()
        group_correlations[group_key] = {
            "features": group_features,
            "matrix": corr_matrix.values.round(4).tolist(),
        }
        print(f"  {group_key}: {len(group_features)}x{len(group_features)} matrix")

    with open(OUTPUT_DIR / "correlations_by_group.json", "w") as f:
        json.dump(group_correlations, f, indent=2)

    # --- Part 2: correlation of every feature against the target ---
    print(f"\nComputing correlation of every feature against '{TARGET_COLUMN}'...")
    target_correlations = {}
    for name in feature_cols:
        if name == TARGET_COLUMN:
            continue
        corr = df[name].corr(df[TARGET_COLUMN])
        target_correlations[name] = round(float(corr), 4) if pd.notna(corr) else None

    # sort by absolute strength, strongest first - most useful ordering
    # for a quick-scan "which features matter most" table
    sorted_by_strength = dict(
        sorted(
            target_correlations.items(),
            key=lambda kv: abs(kv[1]) if kv[1] is not None else -1,
            reverse=True,
        )
    )

    with open(OUTPUT_DIR / "correlation_with_target.json", "w") as f:
        json.dump(sorted_by_strength, f, indent=2)

    print("\nTop 10 features by correlation strength with the target:")
    for name, corr in list(sorted_by_strength.items())[:10]:
        print(f"  {name:35s} {corr}")

    print(f"\nDONE - saved to {OUTPUT_DIR}/correlations_by_group.json")
    print(f"       and {OUTPUT_DIR}/correlation_with_target.json")


if __name__ == "__main__":
    main()