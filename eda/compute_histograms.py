"""
Precompute Histograms - Step 3 of the EDA Page Plan

For every feature, computes bin edges + point counts per bin, ONCE.
The webpage just draws bars from these saved numbers.

Run: uv run python eda/compute_histograms.py
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
OUTPUT_PATH = Path(__file__).parent / "precomputed" / "histograms.json"
N_BINS = 40


def compute_histogram(series, n_bins=N_BINS):
    valid = series.dropna()
    if len(valid) == 0:
        return None
    counts, bin_edges = np.histogram(valid, bins=n_bins)
    return {
        "bin_edges": [float(x) for x in bin_edges],
        "counts": [int(x) for x in counts],
        "n_valid": int(len(valid)),
        "n_missing": int(len(series) - len(valid)),
    }


def main():
    print("=" * 60)
    print("PRECOMPUTING HISTOGRAMS")
    print("=" * 60)

    feature_cols = list(FEATURE_DICTIONARY.keys())
    df = pd.read_parquet(DATASET_PATH, columns=feature_cols)
    print(f"Loaded {len(df):,} rows, {len(feature_cols)} features")

    results = {}
    for name in feature_cols:
        hist = compute_histogram(df[name])
        if hist:
            results[name] = hist
            print(f"  {name:35s} {hist['n_valid']:,} valid points, {N_BINS} bins")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDONE - saved {len(results)} histograms to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()