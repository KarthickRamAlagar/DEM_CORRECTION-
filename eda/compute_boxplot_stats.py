"""
Precompute Box Plot Statistics - Step 2 of the EDA Page Plan

Computes standard box-plot statistics for every feature in the golden
dataset, ONCE, and saves the result as a small JSON file. The EDA
webpage will only ever read this small file - it never recalculates
these numbers itself.

Standard box-plot definition used here:
- Q1 = 25th percentile, Q3 = 75th percentile
- IQR = Q3 - Q1
- Lower whisker = smallest real data value >= Q1 - 1.5*IQR
- Upper whisker = largest real data value <= Q3 + 1.5*IQR
- Outliers = any points beyond the whiskers
- min/max = the actual smallest/largest values in the data (kept
  separate from the whiskers, since a box plot's "min/max" whiskers
  are NOT simply the data's true min/max - that's a common mix-up)

Missing values (NaN) are excluded from every calculation, and the
count of valid (non-null) values used is recorded per feature - this
matters a lot for the SAR columns, which are ~88-90% missing.

Run: uv run python eda/compute_boxplot_stats.py
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
OUTPUT_DIR = Path(__file__).parent / "precomputed"
OUTPUT_PATH = OUTPUT_DIR / "boxplot_stats.json"


def compute_boxplot_stats(series):
    """
    Compute one feature's box-plot statistics. Returns None if the
    feature has zero valid (non-null) values - shouldn't happen given
    our earlier validation, but handled defensively rather than crashing
    the whole precompute run over one bad column.
    """
    valid = series.dropna()
    n_valid = len(valid)
    n_missing = len(series) - n_valid

    if n_valid == 0:
        return None

    q1 = float(np.percentile(valid, 25))
    median = float(np.percentile(valid, 50))
    q3 = float(np.percentile(valid, 75))
    iqr = q3 - q1

    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr

    within_fences = valid[(valid >= lower_fence) & (valid <= upper_fence)]
    lower_whisker = float(within_fences.min()) if len(within_fences) > 0 else q1
    upper_whisker = float(within_fences.max()) if len(within_fences) > 0 else q3

    outliers = valid[(valid < lower_fence) | (valid > upper_fence)]

    return {
        "min": float(valid.min()),
        "lower_whisker": lower_whisker,
        "q1": q1,
        "median": median,
        "q3": q3,
        "upper_whisker": upper_whisker,
        "max": float(valid.max()),
        "outlier_count": int(len(outliers)),
        "n_valid": int(n_valid),
        "n_missing": int(n_missing),
        "missing_pct": round(100 * n_missing / len(series), 2),
    }


def main():
    print("=" * 60)
    print("PRECOMPUTING BOX PLOT STATISTICS")
    print("=" * 60)

    print(f"\nLoading {DATASET_PATH}...")
    feature_cols = list(FEATURE_DICTIONARY.keys())
    df = pd.read_parquet(DATASET_PATH, columns=feature_cols)
    print(f"  Loaded {len(df):,} rows, {len(feature_cols)} feature columns")

    results = {}
    skipped = []

    print("\nComputing statistics per feature...")
    for feature_name in feature_cols:
        stats = compute_boxplot_stats(df[feature_name])
        if stats is None:
            skipped.append(feature_name)
            continue
        results[feature_name] = stats
        print(f"  {feature_name:35s} median={stats['median']:>12.4f}  "
              f"missing={stats['missing_pct']:>5.1f}%")

    if skipped:
        print(f"\nWARNING: {len(skipped)} feature(s) had zero valid data, skipped: {skipped}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 60)
    print(f"DONE - saved {len(results)} features' box plot stats to:")
    print(f"  {OUTPUT_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()