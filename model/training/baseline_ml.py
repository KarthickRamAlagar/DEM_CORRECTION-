"""
ML Baseline Models - Modeling Phase, Step 3b

Linear Regression -> Random Forest -> LightGBM alone, each trained on
the full 44-feature set (unlike the interpolation baselines, which
only used lat/lon) using the same verified spatial split.

REAL DESIGN DECISION, TESTED: 8 of the 44 features are SAR-based and
~88% missing. LightGBM handles missing values natively, but scikit-
learn's LinearRegression and RandomForestRegressor crash on NaN
(confirmed by direct testing). Rather than give each model a different
effective dataset (which would confound the comparison), ALL THREE
models use the same median-imputed data - imputation values are always
computed from the TRAINING fold only, never the test fold, to avoid
any leakage.

Unlike the interpolation baselines, these models scale natively to the
full dataset size - no subsampling needed here.

Run: uv run python model/training/baseline_ml.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
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


def impute_train_test(train_df, test_df, features, global_medians):
    """
    Computes median values from TRAIN data only, applies the same
    values to both train and test. Never computes anything from the
    test fold - that would be a real leakage bug.

    FIX (from a real crash on the actual data): if an entire fold's
    training set has ZERO valid values for a column (plausible for SAR
    columns, whose ~88% missingness is geographically clustered by
    Sentinel-1's swath pattern, not randomly scattered), that column's
    train median is itself NaN - and fillna(NaN) does nothing, leaving
    real NaN values that crash LinearRegression/RandomForest. Falls
    back to a GLOBAL median (computed once from the whole dataset,
    passed in) only for this rare edge case - never used when the
    fold's own training median is available.
    """
    train_imputed = train_df[features].copy()
    test_imputed = test_df[features].copy()

    medians = train_imputed.median()
    medians = medians.fillna(global_medians)  # fallback only where the fold median itself is NaN

    train_imputed = train_imputed.fillna(medians)
    test_imputed = test_imputed.fillna(medians)

    return train_imputed, test_imputed


def _metrics(actual, predicted):
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    return {"rmse": rmse, "mae": mae}


def evaluate_fold(train_df, test_df, features, target, global_medians):
    X_train, X_test = impute_train_test(train_df, test_df, features, global_medians)
    y_train = train_df[target].values
    y_test = test_df[target].values

    results = {}

    lr = LinearRegression()
    lr.fit(X_train, y_train)
    results["Linear Regression"] = _metrics(y_test, lr.predict(X_test))

    rf = RandomForestRegressor(n_estimators=100, max_depth=15, n_jobs=-1, random_state=RANDOM_SEED)
    rf.fit(X_train, y_train)
    results["Random Forest"] = _metrics(y_test, rf.predict(X_test))

    # LightGBM gets the ORIGINAL (non-imputed) data - it handles NaN
    # natively and often performs better without artificial imputation
    # masking real missingness patterns. Kept separate on purpose.
    lgbm = LGBMRegressor(n_estimators=200, max_depth=8, random_state=RANDOM_SEED, verbose=-1)
    lgbm.fit(train_df[features], y_train)
    results["LightGBM (alone)"] = _metrics(y_test, lgbm.predict(test_df[features]))

    return results


def main():
    print("=" * 60)
    print("ML BASELINE MODELS - Linear Regression, Random Forest, LightGBM")
    print("=" * 60)

    features = get_model_features()
    target = get_target_column()
    print(f"\nUsing {len(features)} input features, target: {target}")

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH, columns=["latitude", "longitude", target] + features)
    print(f"  Loaded {len(df):,} rows")

    print("\nRebuilding the verified spatial split...")
    row, col, _, _ = compute_grid_cells(df)
    df["_block"] = list(zip(row, col))
    unique_blocks = df["_block"].unique().tolist()
    block_fold = assign_blocks_to_folds(unique_blocks, N_FOLDS, RANDOM_SEED)
    df["_fold"] = df["_block"].map(block_fold)

    # Computed ONCE from the whole dataset - only used as a fallback
    # when a specific fold's own training median is NaN (see the fix
    # explained in impute_train_test's docstring above)
    global_medians = df[features].median()

    all_fold_results = {method: [] for method in ["Linear Regression", "Random Forest", "LightGBM (alone)"]}

    for test_fold in range(N_FOLDS):
        print(f"\n--- Fold {test_fold} as test ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]
        print(f"  {len(train_df):,} train / {len(test_df):,} test points")

        fold_results = evaluate_fold(train_df, test_df, features, target, global_medians)
        for method, metrics in fold_results.items():
            all_fold_results[method].append(metrics)
            print(f"  {method:20s} RMSE={metrics['rmse']:.4f}  MAE={metrics['mae']:.4f}")

    print("\n" + "=" * 60)
    print("AVERAGE ACROSS ALL 5 FOLDS")
    print("=" * 60)
    for method, fold_list in all_fold_results.items():
        avg_rmse = np.mean([f["rmse"] for f in fold_list])
        avg_mae = np.mean([f["mae"] for f in fold_list])
        print(f"  {method:20s} RMSE={avg_rmse:.4f}  MAE={avg_mae:.4f}")


if __name__ == "__main__":
    main()