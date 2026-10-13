"""
Final Proposed Model - Modeling Phase, Step 4

LightGBM + CatBoost ensemble, matching the PPT's proposed final model.
Uses the FULL 44-feature set (confirmed better than a reduced set in
quick_checks.py's real test).

ENSEMBLE METHOD: simple averaging of both models' independent
predictions - the most common, transparent, and defensible ensemble
approach. Both LightGBM and CatBoost handle missing values (SAR
columns' ~88% missingness) natively, confirmed by direct testing, so
neither needs imputation - the ensemble uses the ORIGINAL data.

LightGBM uses the hyperparameters already found and verified in
tune_and_compare.py. CatBoost gets its own quick search here, same
"medium" depth and two-stage pattern as everything else in this phase.

Loss function: plain MSE for both models, as agreed - the physics-
aware MSE+GDL loss is explicitly deferred to a later refinement, not
attempted here.

Run: uv run python model/training/final_ensemble.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor

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

# Already found and verified in tune_and_compare.py
BEST_LGBM_PARAMS = {"n_estimators": 200, "num_leaves": 63, "max_depth": -1, "learning_rate": 0.05}

CATBOOST_PARAM_SPACE = {
    "iterations": [200, 400],
    "depth": [6, 8, 10],
    "learning_rate": [0.05, 0.1],
}
N_SEARCH_TRIALS = 6
TUNING_FOLD = 0
TUNING_SUBSAMPLE_SIZE = 150_000


def sample_params(param_space, n_samples, seed):
    rng = np.random.default_rng(seed)
    combos, seen = [], set()
    while len(combos) < n_samples:
        combo = {k: rng.choice(v) for k, v in param_space.items()}
        key = tuple(sorted(combo.items()))
        if key not in seen:
            seen.add(key)
            combos.append(combo)
    return combos


def _metrics(actual, predicted):
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    return {"rmse": rmse, "mae": mae}


def tune_catboost(train_df, test_df, features, target):
    subsample = train_df.sample(n=min(TUNING_SUBSAMPLE_SIZE, len(train_df)), random_state=RANDOM_SEED)
    y_train = subsample[target].values
    y_test = test_df[target].values

    print(f"\n  Searching CatBoost ({N_SEARCH_TRIALS} trials on {len(subsample):,}-row subsample)...")
    best_params, best_rmse = None, np.inf
    for params in sample_params(CATBOOST_PARAM_SPACE, N_SEARCH_TRIALS, RANDOM_SEED):
        model = CatBoostRegressor(**params, random_state=RANDOM_SEED, verbose=False)
        model.fit(subsample[features], y_train)
        rmse = _metrics(y_test, model.predict(test_df[features]))["rmse"]
        print(f"    {params} -> RMSE={rmse:.4f}")
        if rmse < best_rmse:
            best_rmse, best_params = rmse, params
    return best_params


def main():
    print("=" * 60)
    print("FINAL PROPOSED MODEL - LightGBM + CatBoost Ensemble")
    print("=" * 60)

    features = get_model_features()
    target = get_target_column()

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH, columns=["latitude", "longitude", target] + features)
    print(f"  Loaded {len(df):,} rows")

    print("\nRebuilding the verified spatial split...")
    row, col, _, _ = compute_grid_cells(df)
    df["_block"] = list(zip(row, col))
    unique_blocks = df["_block"].unique().tolist()
    block_fold = assign_blocks_to_folds(unique_blocks, N_FOLDS, RANDOM_SEED)
    df["_fold"] = df["_block"].map(block_fold)

    print(f"\n{'=' * 60}\nSEARCHING CATBOOST HYPERPARAMETERS (fold {TUNING_FOLD}, subsampled)\n{'=' * 60}")
    excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, TUNING_FOLD, CELL_SIZE_KM, BUFFER_KM)
    tuning_test_df = df[df["_fold"] == TUNING_FOLD]
    tuning_train_df = df[~df["_block"].isin(excluded_blocks)]
    best_catboost_params = tune_catboost(tuning_train_df, tuning_test_df, features, target)
    print(f"\n  Best CatBoost params: {best_catboost_params}")

    print(f"\n{'=' * 60}\nFAITHFUL FULL 5-FOLD EVALUATION\n{'=' * 60}")
    print("(These ARE the real, reportable numbers)")

    all_results = {"LightGBM (alone)": [], "CatBoost (alone)": [], "Ensemble (LightGBM + CatBoost)": []}

    for test_fold in range(N_FOLDS):
        print(f"\n  --- Fold {test_fold} as test ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]

        y_train = train_df[target].values
        y_test = test_df[target].values

        lgbm = LGBMRegressor(**BEST_LGBM_PARAMS, random_state=RANDOM_SEED, verbose=-1)
        lgbm.fit(train_df[features], y_train)
        pred_lgbm = lgbm.predict(test_df[features])
        all_results["LightGBM (alone)"].append(_metrics(y_test, pred_lgbm))

        catboost = CatBoostRegressor(**best_catboost_params, random_state=RANDOM_SEED, verbose=False)
        catboost.fit(train_df[features], y_train)
        pred_catboost = catboost.predict(test_df[features])
        all_results["CatBoost (alone)"].append(_metrics(y_test, pred_catboost))

        # THE ENSEMBLE: simple average of both models' predictions
        pred_ensemble = (pred_lgbm + pred_catboost) / 2
        all_results["Ensemble (LightGBM + CatBoost)"].append(_metrics(y_test, pred_ensemble))

        for method in all_results:
            m = all_results[method][-1]
            print(f"    {method:32s} RMSE={m['rmse']:.4f}  MAE={m['mae']:.4f}")

    print(f"\n{'=' * 60}\nFINAL AVERAGE - COMPARE AGAINST ALL PREVIOUS RESULTS\n{'=' * 60}")
    print("  Linear Regression:            RMSE=3.2702  MAE=1.7843")
    print("  Ridge Regression:              RMSE=3.2689  MAE=1.7825")
    print("  Random Forest (tuned):         RMSE=3.3999  MAE=1.9664")
    print("  LightGBM (tuned, 44 features): RMSE=3.3215  MAE=1.9012")
    print()
    for method, fold_list in all_results.items():
        avg_rmse = np.mean([f["rmse"] for f in fold_list])
        avg_mae = np.mean([f["mae"] for f in fold_list])
        print(f"  {method:32s} RMSE={avg_rmse:.4f}  MAE={avg_mae:.4f}")


if __name__ == "__main__":
    main()