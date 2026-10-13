"""
Precompute Moran's Scatter Plot Data

A Moran's scatter plot compares each point's own value (x-axis) against
the average value of its nearest neighbors (y-axis, the "spatial lag").
Points clustering along a rising diagonal indicate spatial clustering
(similar values sit near each other) - which directly explains WHY the
spatial_autocorrelation_moran feature (built during enrichment) has the
values it does.

This reuses the exact same k-nearest-neighbor approach already used to
compute spatial_autocorrelation_moran in enrich_final_dataset.py, but
saves BOTH the point's own value and its neighbor average - the
enrichment step only kept the final combined score, not these two
separate pieces needed for this specific plot.

Run: uv run python eda/compute_morans_scatter.py
"""

import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
OUTPUT_PATH = Path(__file__).parent / "precomputed" / "morans_scatter.json"

VALUE_COLUMN = "raw_z"  # same column the original Moran's I was computed on
K_NEIGHBORS = 8
PLOT_SAMPLE_SIZE = 5000  # for the actual scatter points shown - the neighbor
                          # calculation itself still uses the FULL dataset,
                          # this only limits what gets drawn/saved
RANDOM_SEED = 42


def main():
    print("=" * 60)
    print("PRECOMPUTING MORAN'S SCATTER PLOT DATA")
    print("=" * 60)

    df = pd.read_parquet(DATASET_PATH, columns=["longitude", "latitude", VALUE_COLUMN])
    print(f"Loaded {len(df):,} rows")

    coords = df[["longitude", "latitude"]].values
    values = df[VALUE_COLUMN].values
    global_mean = np.nanmean(values)
    z = values - global_mean  # standardized (mean-centered) values

    print(f"Building spatial index and finding {K_NEIGHBORS} nearest neighbors "
          f"for every point (uses the full {len(df):,}-point dataset for accuracy)...")
    tree = cKDTree(coords)
    _, neighbor_idx = tree.query(coords, k=K_NEIGHBORS + 1)
    neighbor_idx = neighbor_idx[:, 1:]  # drop self

    spatial_lag = z[neighbor_idx].mean(axis=1)  # each point's neighbor average

    print(f"Sampling {PLOT_SAMPLE_SIZE:,} points for the actual saved plot...")
    rng = np.random.default_rng(RANDOM_SEED)
    sample_idx = rng.choice(len(df), size=PLOT_SAMPLE_SIZE, replace=False)

    results = {
        "value_column": VALUE_COLUMN,
        "x_own_value": [float(v) for v in z[sample_idx]],
        "y_neighbor_average": [float(v) for v in spatial_lag[sample_idx]],
        "note": (
            "x = point's own value (mean-centered), y = average of its "
            f"{K_NEIGHBORS} nearest neighbors (also mean-centered). "
            "A rising diagonal pattern indicates spatial clustering - "
            "similar values sit near each other."
        ),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDONE - saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()