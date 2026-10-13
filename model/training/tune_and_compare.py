"""
Hyperparameter Tuning - Modeling Phase, Step 3c

TWO-STAGE DESIGN, chosen for real computational reasons: a full grid
search across many hyperparameter combinations x all 5 full-size folds
would take many hours, given how long even ONE untuned Random Forest
fit already took on the complete dataset.

Stage 1 (fast search): try several hyperparameter combinations on a
SUBSAMPLE of one fold (Fold 0), to quickly find promising settings.

Stage 2 (faithful evaluation): take ONLY the best-found settings from
Stage 1, then re-run the full, rigorous 5-fold evaluation on the
COMPLETE dataset - matching baseline_ml.py's exact standard - for the
real, reportable final numbers.

This means Stage 1's numbers are never reported as final results -
they only exist to pick good hyperparameters quickly. Only Stage 2's
numbers are directly comparable to the untuned baseline_ml.py results.

Run: uv run python model/training/tune_and_compare.py
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

TUNING_FOLD = 0  # arbitrary but fixed choice, used only for the fast search
TUNING_SUBSAMPLE_SIZE = 150_000  # keeps each search trial fast
N_SEARCH_TRIALS = 6  # "medium" depth - a handful of real candidates, not exhaustive

RF_PARAM_SPACE = {
    "n_estimators": [100, 150, 200],
    "max_depth": [8, 12, 16, 20],
    "min_samples_leaf": [1, 5, 10],
}

LGBM_PARAM_SPACE = {
    "n_estimators": [200, 400],
    "num_leaves": [31, 63, 127],
    "max_depth": [6, 10, -1],
    "learning_rate": [0.05, 0.1],
}


def sample_params(param_space, n_samples, seed):
    rng = np.random.default_rng(seed)
    combos = []
    seen = set()
    while len(combos) < n_samples:
        combo = {k: rng.choice(v) for k, v in param_space.items()}
        key = tuple(sorted(combo.items()))
        if key not in seen:  # avoid testing the exact same combo twice
            seen.add(key)
            combos.append(combo)
    return combos


def impute_train_test(train_df, test_df, features, global_medians):
    train_imputed = train_df[features].copy()
    test_imputed = test_df[features].copy()
    medians = train_imputed.median().fillna(global_medians)
    return train_imputed.fillna(medians), test_imputed.fillna(medians)


def _metrics(actual, predicted):
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    return {"rmse": rmse, "mae": mae}


def stage1_fast_search(train_df, test_df, features, target, global_medians):
    """Fast search on a subsample of ONE fold - picks good hyperparameters
    quickly, does NOT produce final reportable numbers."""
    subsample = train_df.sample(n=min(TUNING_SUBSAMPLE_SIZE, len(train_df)), random_state=RANDOM_SEED)
    X_train, X_test = impute_train_test(subsample, test_df, features, global_medians)
    y_train = subsample[target].values
    y_test = test_df[target].values

    print(f"\n  Stage 1: searching Random Forest ({N_SEARCH_TRIALS} trials on "
          f"{len(subsample):,}-row subsample)...")
    best_rf_rmse = np.inf
    best_rf_params = None
    for params in sample_params(RF_PARAM_SPACE, N_SEARCH_TRIALS, RANDOM_SEED):
        model = RandomForestRegressor(**params, n_jobs=-1, random_state=RANDOM_SEED)
        model.fit(X_train, y_train)
        rmse = _metrics(y_test, model.predict(X_test))["rmse"]
        print(f"    {params} -> RMSE={rmse:.4f}")
        if rmse < best_rf_rmse:
            best_rf_rmse = rmse
            best_rf_params = params

    print(f"\n  Stage 1: searching LightGBM ({N_SEARCH_TRIALS} trials)...")
    best_lgbm_rmse = np.inf
    best_lgbm_params = None
    for params in sample_params(LGBM_PARAM_SPACE, N_SEARCH_TRIALS, RANDOM_SEED + 1):
        model = LGBMRegressor(**params, random_state=RANDOM_SEED, verbose=-1)
        model.fit(subsample[features], y_train)  # LightGBM gets non-imputed data, as in baseline_ml.py
        rmse = _metrics(y_test, model.predict(test_df[features]))["rmse"]
        print(f"    {params} -> RMSE={rmse:.4f}")
        if rmse < best_lgbm_rmse:
            best_lgbm_rmse = rmse
            best_lgbm_params = params

    return best_rf_params, best_lgbm_params


def stage2_full_evaluation(df, features, target, unique_blocks, block_fold, global_medians,
                            best_rf_params, best_lgbm_params):
    """Faithful full 5-fold evaluation using ONLY the best-found
    hyperparameters - these ARE the real, reportable numbers."""
    all_results = {"Linear Regression": [], "Random Forest (tuned)": [], "LightGBM (tuned)": []}

    for test_fold in range(N_FOLDS):
        print(f"\n  --- Fold {test_fold} as test ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]

        X_train, X_test = impute_train_test(train_df, test_df, features, global_medians)
        y_train = train_df[target].values
        y_test = test_df[target].values

        lr = LinearRegression().fit(X_train, y_train)
        all_results["Linear Regression"].append(_metrics(y_test, lr.predict(X_test)))

        rf = RandomForestRegressor(**best_rf_params, n_jobs=-1, random_state=RANDOM_SEED)
        rf.fit(X_train, y_train)
        all_results["Random Forest (tuned)"].append(_metrics(y_test, rf.predict(X_test)))

        lgbm = LGBMRegressor(**best_lgbm_params, random_state=RANDOM_SEED, verbose=-1)
        lgbm.fit(train_df[features], y_train)
        all_results["LightGBM (tuned)"].append(_metrics(y_test, lgbm.predict(test_df[features])))

        for method in all_results:
            m = all_results[method][-1]
            print(f"    {method:24s} RMSE={m['rmse']:.4f}  MAE={m['mae']:.4f}")

    return all_results


def main():
    print("=" * 60)
    print("HYPERPARAMETER TUNING - Random Forest and LightGBM")
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
    global_medians = df[features].median()

    print(f"\n{'=' * 60}\nSTAGE 1 - FAST SEARCH (fold {TUNING_FOLD}, subsampled)\n{'=' * 60}")
    excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, TUNING_FOLD, CELL_SIZE_KM, BUFFER_KM)
    tuning_test_df = df[df["_fold"] == TUNING_FOLD]
    tuning_train_df = df[~df["_block"].isin(excluded_blocks)]

    best_rf_params, best_lgbm_params = stage1_fast_search(
        tuning_train_df, tuning_test_df, features, target, global_medians
    )
    print(f"\nBest Random Forest params found: {best_rf_params}")
    print(f"Best LightGBM params found: {best_lgbm_params}")

    print(f"\n{'=' * 60}\nSTAGE 2 - FAITHFUL FULL 5-FOLD EVALUATION\n{'=' * 60}")
    print("(These ARE the real, reportable numbers - directly comparable to baseline_ml.py)")
    all_results = stage2_full_evaluation(
        df, features, target, unique_blocks, block_fold, global_medians,
        best_rf_params, best_lgbm_params
    )

    print(f"\n{'=' * 60}\nFINAL AVERAGE ACROSS ALL 5 FOLDS\n{'=' * 60}")
    for method, fold_list in all_results.items():
        avg_rmse = np.mean([f["rmse"] for f in fold_list])
        avg_mae = np.mean([f["mae"] for f in fold_list])
        print(f"  {method:24s} RMSE={avg_rmse:.4f}  MAE={avg_mae:.4f}")


if __name__ == "__main__":
    main()