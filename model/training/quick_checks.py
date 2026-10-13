"""
Quick Follow-Up Checks - Modeling Phase, Step 3d

Two honest, cheap tests before building the final ensemble:

1. RIDGE REGRESSION: plain Linear Regression won against tuned trees.
   Ridge adds regularization, automatically down-weighting the weak/
   near-noise features (NDVI, SAR, radar flags - all confirmed near-
   zero correlation in EDA). If Linear Regression's win was partly
   because those noisy features hurt it less than they hurt trees,
   Ridge might do even better.

2. REDUCED-FEATURE LIGHTGBM: trees choose splits greedily, so feeding
   44 features (many weak) can cause worse splits than feeding just
   the strongest, real signal. Tests LightGBM using ONLY the top 12
   real features by |correlation with target| (verified from EDA):
   slope_mean_5x5, tri, slope_std_5x5, slope_deg, elev_std_3x3, raw_z,
   elev_mean_3x3, spatial_autocorrelation_moran, tpi, general_curvature,
   profile_curvature, planform_curvature.

Uses the SAME verified spatial split and the SAME tuned LightGBM
hyperparameters found in tune_and_compare.py, so results are directly
comparable to everything already measured.

Run: uv run python model/training/quick_checks.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from lightgbm import LGBMRegressor

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent / "helpers"))

from dem_correction.config import DATA_FINAL
from feature_selection import get_model_features, get_target_column
from spatial_split import compute_grid_cells, assign_blocks_to_folds, compute_buffer_exclusions

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
CELL_SIZE_KM = 10.0
BUFFER_KM = 5.0
N_FOLDS = 5
RANDOM_SEED = 42

TOP_12_FEATURES = [
    "slope_mean_5x5", "tri", "slope_std_5x5", "slope_deg", "elev_std_3x3",
    "raw_z", "elev_mean_3x3", "spatial_autocorrelation_moran", "tpi",
    "general_curvature", "profile_curvature", "planform_curvature",
]

BEST_LGBM_PARAMS = {"n_estimators": 200, "num_leaves": 63, "max_depth": -1, "learning_rate": 0.05}
RIDGE_ALPHA_CANDIDATES = [1.0, 10.0, 50.0]
TUNING_FOLD = 0
TUNING_SUBSAMPLE_SIZE = 150_000


def impute_train_test(train_df, test_df, features, global_medians):
    train_imputed = train_df[features].copy()
    test_imputed = test_df[features].copy()
    medians = train_imputed.median().fillna(global_medians[features])
    return train_imputed.fillna(medians), test_imputed.fillna(medians)


def _metrics(actual, predicted):
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    return {"rmse": rmse, "mae": mae}


def pick_best_ridge_alpha(train_df, test_df, features, target, global_medians):
    subsample = train_df.sample(n=min(TUNING_SUBSAMPLE_SIZE, len(train_df)), random_state=RANDOM_SEED)
    X_train, X_test = impute_train_test(subsample, test_df, features, global_medians)
    y_train = subsample[target].values
    y_test = test_df[target].values

    best_alpha, best_rmse = None, np.inf
    print("\n  Picking Ridge alpha...")
    for alpha in RIDGE_ALPHA_CANDIDATES:
        model = Ridge(alpha=alpha).fit(X_train, y_train)
        rmse = _metrics(y_test, model.predict(X_test))["rmse"]
        print(f"    alpha={alpha:6.1f} -> RMSE={rmse:.4f}")
        if rmse < best_rmse:
            best_rmse, best_alpha = rmse, alpha
    return best_alpha


def main():
    print("=" * 60)
    print("QUICK FOLLOW-UP CHECKS - Ridge Regression, Reduced-Feature LightGBM")
    print("=" * 60)

    all_features = get_model_features()
    target = get_target_column()

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH, columns=["latitude", "longitude", target] + all_features)
    print(f"  Loaded {len(df):,} rows")

    print("\nRebuilding the verified spatial split...")
    row, col, _, _ = compute_grid_cells(df)
    df["_block"] = list(zip(row, col))
    unique_blocks = df["_block"].unique().tolist()
    block_fold = assign_blocks_to_folds(unique_blocks, N_FOLDS, RANDOM_SEED)
    df["_fold"] = df["_block"].map(block_fold)
    global_medians = df[all_features].median()

    excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, TUNING_FOLD, CELL_SIZE_KM, BUFFER_KM)
    tuning_test_df = df[df["_fold"] == TUNING_FOLD]
    tuning_train_df = df[~df["_block"].isin(excluded_blocks)]

    best_alpha = pick_best_ridge_alpha(tuning_train_df, tuning_test_df, all_features, target, global_medians)
    print(f"\n  Best Ridge alpha: {best_alpha}")

    print(f"\n{'=' * 60}\nFAITHFUL FULL 5-FOLD EVALUATION\n{'=' * 60}")
    all_results = {"Ridge Regression": [], "LightGBM (top 12 features)": []}

    for test_fold in range(N_FOLDS):
        print(f"\n  --- Fold {test_fold} as test ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]

        X_train, X_test = impute_train_test(train_df, test_df, all_features, global_medians)
        y_train = train_df[target].values
        y_test = test_df[target].values

        ridge = Ridge(alpha=best_alpha).fit(X_train, y_train)
        all_results["Ridge Regression"].append(_metrics(y_test, ridge.predict(X_test)))

        lgbm_reduced = LGBMRegressor(**BEST_LGBM_PARAMS, random_state=RANDOM_SEED, verbose=-1)
        lgbm_reduced.fit(train_df[TOP_12_FEATURES], y_train)
        all_results["LightGBM (top 12 features)"].append(
            _metrics(y_test, lgbm_reduced.predict(test_df[TOP_12_FEATURES]))
        )

        for method in all_results:
            m = all_results[method][-1]
            print(f"    {method:28s} RMSE={m['rmse']:.4f}  MAE={m['mae']:.4f}")

    print(f"\n{'=' * 60}\nFINAL AVERAGE - COMPARE AGAINST PREVIOUS RESULTS\n{'=' * 60}")
    print("  (Linear Regression: 3.2702 | Random Forest tuned: 3.3999 | LightGBM tuned (44 feat): 3.3215)")
    for method, fold_list in all_results.items():
        avg_rmse = np.mean([f["rmse"] for f in fold_list])
        avg_mae = np.mean([f["mae"] for f in fold_list])
        print(f"  {method:28s} RMSE={avg_rmse:.4f}  MAE={avg_mae:.4f}")


if __name__ == "__main__":
    main()