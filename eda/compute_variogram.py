"""
Precompute Empirical Variogram

A variogram shows how "different" two points' values tend to be as the
distance between them grows - typically, nearby points are similar
(low semivariance) and far-apart points are less related (semivariance
rises, then flattens out).

WHY THIS MATTERS BEYOND EDA: the distance at which semivariance
flattens out (the "range") is a genuine, data-driven way to choose the
block size for Spatial Block Cross-Validation, coming up in the
modeling stage - rather than picking 10km arbitrarily, this plot gives
real evidence for what block size actually makes sense for this data.

Computing this over all 1.2M points directly is computationally
infeasible (pairwise distances scale as n^2). This subsamples a
manageable number of points first, then computes all pairs within
that subsample.

Run: uv run python eda/compute_variogram.py
"""

import sys
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial.distance import pdist

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
OUTPUT_PATH = Path(__file__).parent / "precomputed" / "variogram.json"

VALUE_COLUMN = "elevation_error_signed"  # the actual target - most relevant for CV block sizing
SUBSAMPLE_SIZE = 3000  # 3000 points -> ~4.5 million pairs, manageable
N_DISTANCE_BINS = 20
RANDOM_SEED = 42


def main():
    print("=" * 60)
    print("PRECOMPUTING EMPIRICAL VARIOGRAM")
    print("=" * 60)

    df = pd.read_parquet(DATASET_PATH, columns=["longitude", "latitude", VALUE_COLUMN])
    df = df.dropna(subset=[VALUE_COLUMN])
    print(f"Loaded {len(df):,} valid rows")

    rng = np.random.default_rng(RANDOM_SEED)
    sample_idx = rng.choice(len(df), size=SUBSAMPLE_SIZE, replace=False)
    sample = df.iloc[sample_idx]
    print(f"Subsampled {SUBSAMPLE_SIZE:,} points ({SUBSAMPLE_SIZE*(SUBSAMPLE_SIZE-1)//2:,} pairs)")

    coords = sample[["longitude", "latitude"]].values
    values = sample[VALUE_COLUMN].values

    print("Computing pairwise distances (in km) and squared value differences...")
    # rough degree-to-km conversion at this latitude - consistent with
    # the same approximation used elsewhere in this project
    coords_km = coords * 111.0
    distances = pdist(coords_km, metric="euclidean")
    value_diffs_sq = pdist(values.reshape(-1, 1), metric="sqeuclidean")

    print(f"Binning into {N_DISTANCE_BINS} distance bins...")
    max_dist = float(np.percentile(distances, 95))  # ignore the extreme tail
    bin_edges = np.linspace(0, max_dist, N_DISTANCE_BINS + 1)
    bin_indices = np.digitize(distances, bin_edges) - 1

    variogram_points = []
    for i in range(N_DISTANCE_BINS):
        mask = bin_indices == i
        if mask.sum() == 0:
            continue
        avg_distance = float(distances[mask].mean())
        semivariance = float(value_diffs_sq[mask].mean() / 2)  # standard variogram definition
        variogram_points.append({
            "distance_km": round(avg_distance, 2),
            "semivariance": round(semivariance, 4),
            "n_pairs": int(mask.sum()),
        })

    results = {
        "value_column": VALUE_COLUMN,
        "points": variogram_points,
        "note": (
            "Semivariance typically rises with distance, then flattens - "
            "the distance where it flattens (the 'range') suggests how "
            "far apart points need to be before they stop influencing "
            "each other, useful for choosing spatial cross-validation "
            "block size."
        ),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDONE - saved {len(variogram_points)} distance bins to {OUTPUT_PATH}")
    print("\nPreview:")
    for p in variogram_points[:5]:
        print(f"  {p['distance_km']:.1f} km -> semivariance {p['semivariance']:.3f} ({p['n_pairs']} pairs)")


if __name__ == "__main__":
    main()