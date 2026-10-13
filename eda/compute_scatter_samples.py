"""
Precompute Scatter Samples - Step 5 of the EDA Page Plan

Plotting all 1.2 million points would freeze a browser. Instead, we
pick ONE random sample of row indices (so every feature's scatter plot
refers to the SAME underlying points, making cross-feature comparisons
fair), then save each feature's values at those points alongside the
target value.

Run: uv run python eda/compute_scatter_samples.py
"""

import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent))

from dem_correction.config import DATA_FINAL
from feature_dictionary import FEATURE_DICTIONARY

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
OUTPUT_PATH = Path(__file__).parent / "precomputed" / "scatter_samples.json"
TARGET_COLUMN = "elevation_error_signed"
SAMPLE_SIZE = 5000
RANDOM_SEED = 42  # fixed, so the same sample is used if this is ever re-run


def clean(value):
    """Convert NaN to None so JSON encoding doesn't choke on it."""
    return None if pd.isna(value) else float(value)


def main():
    print("=" * 60)
    print("PRECOMPUTING SCATTER SAMPLES")
    print("=" * 60)

    feature_cols = list(FEATURE_DICTIONARY.keys())
    df = pd.read_parquet(DATASET_PATH, columns=feature_cols)
    print(f"Loaded {len(df):,} rows, {len(feature_cols)} features")

    rng = np.random.default_rng(RANDOM_SEED)
    sample_idx = rng.choice(len(df), size=SAMPLE_SIZE, replace=False)
    sample_df = df.iloc[sample_idx].reset_index(drop=True)
    print(f"Sampled {SAMPLE_SIZE:,} rows (fixed seed {RANDOM_SEED}, reproducible)")

    target_values = [clean(v) for v in sample_df[TARGET_COLUMN]]

    results = {"target_column": TARGET_COLUMN, "target_values": target_values, "features": {}}

    for name in feature_cols:
        if name == TARGET_COLUMN:
            continue
        results["features"][name] = [clean(v) for v in sample_df[name]]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDONE - saved {len(results['features'])} features' scatter samples to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()