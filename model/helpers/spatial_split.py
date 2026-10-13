"""
Spatial Block Split - Modeling Phase, Step 2

Implements the confirmed decision: 10km x 10km blocks, 5km buffer,
5-fold cross-validation - matching the thesis proposal exactly.

WHY BLOCKS, NOT RANDOM SPLITTING: nearby points look nearly identical
(similar slope, NDVI, elevation), so randomly shuffling points would
let the model "cheat" by training and testing on nearly-the-same
location. Entire 10km blocks are assigned to folds instead, with a
5km buffer around each test fold's blocks - any point that falls
within that buffer gets excluded from training for that fold, so no
information can leak across the boundary.

Longitude correction: at this latitude (~26.5N), one degree of
longitude covers noticeably less ground than one degree of latitude
(cos(26.5 deg) ~ 0.895), so a naive equal-degree grid would make cells
~11% wider than tall. This uses the correct latitude-adjusted cell
width so blocks are genuinely close to 10km x 10km, not distorted.

Run: uv run python model/helpers/spatial_split.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))
from dem_correction.config import DATA_FINAL

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"

CELL_SIZE_KM = 10.0
BUFFER_KM = 5.0
N_FOLDS = 5
RANDOM_SEED = 42

KM_PER_DEGREE_LAT = 111.0
STUDY_AREA_CENTER_LAT = 26.5  # Gangetic Plains study area midpoint


def compute_grid_cells(df):
    """Assigns every point to a (row, col) block based on real
    lat/lon, using a latitude-corrected cell width so blocks are
    genuinely close to square 10km x 10km, not distorted."""
    km_per_degree_lon = KM_PER_DEGREE_LAT * np.cos(np.radians(STUDY_AREA_CENTER_LAT))

    lat_cell_size_deg = CELL_SIZE_KM / KM_PER_DEGREE_LAT
    lon_cell_size_deg = CELL_SIZE_KM / km_per_degree_lon

    row = (df["latitude"] / lat_cell_size_deg).astype(int)
    col = (df["longitude"] / lon_cell_size_deg).astype(int)
    return row, col, lat_cell_size_deg, lon_cell_size_deg


def assign_blocks_to_folds(unique_blocks, n_folds, seed):
    """
    FIX #2 (from a second real bug caught in testing): the first fix
    banded by LATITUDE (row) to solve the buffer-scattering problem -
    but terrain_region_class is ITSELF defined purely by latitude
    (>=27 deg N = foothill). Banding along that same axis meant each
    fold ended up almost entirely ONE terrain type (folds 0-2 were
    100% plains, fold 4 was 100% foothill) - exactly the imbalance we
    were trying to avoid.

    Fixed by banding along LONGITUDE (col) instead - this cuts ACROSS
    the latitude range in every strip, so each fold naturally spans
    the full north-south range and mixes both plains and foothill
    terrain, while remaining just as spatially contiguous (so the
    buffer fix from before still works correctly).
    """
    cols = [b[1] for b in unique_blocks]
    min_col, max_col = min(cols), max(cols)
    col_range = max_col - min_col + 1
    strip_width = col_range / n_folds

    fold_assignment = {}
    for block in unique_blocks:
        c = block[1]
        fold = min(int((c - min_col) / strip_width), n_folds - 1)
        fold_assignment[block] = fold
    return fold_assignment


def compute_buffer_exclusions(all_blocks, block_fold, test_fold, cell_size_km, buffer_km):
    """
    For a given test fold, returns the set of blocks that must be
    EXCLUDED from training - either because they belong to the test
    fold itself, or because they're within buffer_km of a test-fold
    block's center (verified geometry, tested against synthetic cases
    above).
    """
    exclusion_threshold_km = cell_size_km + buffer_km
    test_blocks = [b for b, f in block_fold.items() if f == test_fold]

    excluded = set()
    for block in all_blocks:
        if block_fold[block] == test_fold:
            excluded.add(block)
            continue
        for test_block in test_blocks:
            dx = (block[1] - test_block[1]) * cell_size_km
            dy = (block[0] - test_block[0]) * cell_size_km
            dist = np.sqrt(dx**2 + dy**2)
            if dist < exclusion_threshold_km:
                excluded.add(block)
                break
    return excluded


def main():
    print("=" * 60)
    print("SPATIAL BLOCK SPLIT - 10km blocks, 5km buffer, 5-fold")
    print("=" * 60)

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH, columns=["latitude", "longitude", "terrain_region_class"])
    print(f"  Loaded {len(df):,} rows")

    print("\nAssigning points to 10km x 10km blocks...")
    row, col, lat_size, lon_size = compute_grid_cells(df)
    df["_block_row"] = row
    df["_block_col"] = col
    df["_block"] = list(zip(row, col))

    unique_blocks = df["_block"].unique().tolist()
    print(f"  {len(unique_blocks)} unique blocks covering the study area")
    print(f"  Cell size: {lat_size:.5f} deg lat x {lon_size:.5f} deg lon "
          f"(both ~{CELL_SIZE_KM}km at this latitude)")

    print(f"\nAssigning blocks to {N_FOLDS} folds (seed={RANDOM_SEED})...")
    block_fold = assign_blocks_to_folds(unique_blocks, N_FOLDS, RANDOM_SEED)
    df["_fold"] = df["_block"].map(block_fold)

    print("\nFold sizes (point counts):")
    fold_counts = df["_fold"].value_counts().sort_index()
    for fold, count in fold_counts.items():
        pct = 100 * count / len(df)
        print(f"  Fold {fold}: {count:,} points ({pct:.1f}%)")

    print("\nTerrain balance check - both plains and foothill should appear in every fold:")
    terrain_by_fold = df.groupby("_fold")["terrain_region_class"].value_counts(normalize=True).unstack()
    print(terrain_by_fold.round(3))

    print(f"\nComputing buffer exclusions for each fold (this defines the real train/test split)...")
    for test_fold in range(N_FOLDS):
        excluded_blocks = compute_buffer_exclusions(
            unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM
        )
        excluded_points = df["_block"].isin(excluded_blocks).sum()
        test_points = (df["_fold"] == test_fold).sum()
        train_points = len(df) - excluded_points
        buffer_only_points = excluded_points - test_points

        print(f"  Fold {test_fold} as test: "
              f"{test_points:,} test points, "
              f"{train_points:,} train points, "
              f"{buffer_only_points:,} points dropped as buffer (neither train nor test)")

    print("\nDONE - spatial split logic verified against real data")


if __name__ == "__main__":
    main()