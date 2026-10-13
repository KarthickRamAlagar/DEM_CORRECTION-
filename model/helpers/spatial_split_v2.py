"""
Spatial split v2 = the existing v1 split (10 km blocks, 5 km buffer, 5 longitude strips)
PLUS a frozen final-test strip.

Rules (declared before any model comparison):
  * FROZEN_FOLD strip is never used to fit, tune, select features or choose a model.
  * Model selection uses 4-fold spatial CV over the remaining strips.
  * The frozen strip is scored ONCE for the winner (and once for the current production recipe, for reference).
"""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from spatial_split import compute_grid_cells, assign_blocks_to_folds, compute_buffer_exclusions  # v1, unchanged

CELL_KM, BUFFER_KM, N_FOLDS, SEED = 10.0, 5.0, 5, 42
FROZEN_FOLD = 3
CV_FOLDS = [f for f in range(N_FOLDS) if f != FROZEN_FOLD]

def assign_folds(df):
    row, col, _, _ = compute_grid_cells(df)
    blocks = list(zip(row, col))
    uniq = list(set(blocks))
    block_fold = assign_blocks_to_folds(uniq, N_FOLDS, SEED)
    block_s = np.empty(len(df), dtype=object); block_s[:] = blocks
    fold = np.array([block_fold[b] for b in blocks])
    return fold, block_s, uniq, block_fold

def cv_masks(fold, block_s, uniq, block_fold, test_fold):
    """Train/test boolean masks for one CV fold. Frozen strip points are excluded from training entirely."""
    excl = compute_buffer_exclusions(uniq, block_fold, test_fold, CELL_KM, BUFFER_KM)
    in_excl = np.fromiter((b in excl for b in block_s), dtype=bool, count=len(block_s))
    test = fold == test_fold
    train = (~in_excl) & (fold != FROZEN_FOLD)
    return train, test

def frozen_masks(fold, block_s, uniq, block_fold):
    """Final test: train on everything outside the frozen strip + its 5 km buffer."""
    excl = compute_buffer_exclusions(uniq, block_fold, FROZEN_FOLD, CELL_KM, BUFFER_KM)
    in_excl = np.fromiter((b in excl for b in block_s), dtype=bool, count=len(block_s))
    return ~in_excl, fold == FROZEN_FOLD
