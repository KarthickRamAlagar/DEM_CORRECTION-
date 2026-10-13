"""
Linear Stacking Ensemble - Modeling Phase, Step 4b

Unlike final_ensemble.py's naive 50/50 average of LightGBM and
CatBoost, this trains a small Linear Regression META-MODEL on top of
THREE base models' predictions (Ridge, LightGBM, CatBoost) - learning
the actual optimal combination weights from real data.

NESTED CROSS-VALIDATION: base models' out-of-fold predictions are
pooled, then a SECOND round of 5-fold splitting trains/evaluates the
meta-model itself, so the meta-model is never evaluated on data used
to fit it either. Verified with a synthetic test before running on
real data - the meta-model correctly learned to trust the most
accurate synthetic base model.

Run: uv run python model/training/stacking_ensemble.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge, LinearRegression
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

RIDGE_ALPHA = 10.0
BEST_LGBM_PARAMS = {"n_estimators": 200, "num_leaves": 63, "max_depth": -1, "learning_rate": 0.05}
BEST_CATBOOST_PARAMS = {"iterations": 200, "depth": 10, "learning_rate": 0.05}


def impute_train_test(train_df, test_df, features, global_medians):
    train_imputed = train_df[features].copy()
    test_imputed = test_df[features].copy()
    medians = train_imputed.median().fillna(global_medians[features])
    return train_imputed.fillna(medians), test_imputed.fillna(medians)


def _metrics(actual, predicted):
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    mae = np.mean(np.abs(actual - predicted))
    return {"rmse": rmse, "mae": mae}


def main():
    print("=" * 60)
    print("LINEAR STACKING ENSEMBLE - Ridge + LightGBM + CatBoost")
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

    print(f"\n{'=' * 60}\nSTEP 1 - GENERATING BASE MODEL OUT-OF-FOLD PREDICTIONS\n{'=' * 60}")
    print("(The expensive part - only done once)")

    all_ridge_pred, all_lgbm_pred, all_catboost_pred = [], [], []
    all_actual, all_fold_id = [], []

    for test_fold in range(N_FOLDS):
        print(f"\n--- Fold {test_fold} ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]
        y_train = train_df[target].values
        y_test = test_df[target].values

        X_train, X_test = impute_train_test(train_df, test_df, features, global_medians)
        ridge = Ridge(alpha=RIDGE_ALPHA).fit(X_train, y_train)
        pred_ridge = ridge.predict(X_test)

        lgbm = LGBMRegressor(**BEST_LGBM_PARAMS, random_state=RANDOM_SEED, verbose=-1)
        lgbm.fit(train_df[features], y_train)
        pred_lgbm = lgbm.predict(test_df[features])

        catboost = CatBoostRegressor(**BEST_CATBOOST_PARAMS, random_state=RANDOM_SEED, verbose=False)
        catboost.fit(train_df[features], y_train)
        pred_catboost = catboost.predict(test_df[features])

        print(f"  Ridge RMSE={_metrics(y_test, pred_ridge)['rmse']:.4f}  "
              f"LightGBM RMSE={_metrics(y_test, pred_lgbm)['rmse']:.4f}  "
              f"CatBoost RMSE={_metrics(y_test, pred_catboost)['rmse']:.4f}")

        all_ridge_pred.append(pred_ridge)
        all_lgbm_pred.append(pred_lgbm)
        all_catboost_pred.append(pred_catboost)
        all_actual.append(y_test)
        all_fold_id.append(np.full(len(y_test), test_fold))

    ridge_pred = np.concatenate(all_ridge_pred)
    lgbm_pred = np.concatenate(all_lgbm_pred)
    catboost_pred = np.concatenate(all_catboost_pred)
    actual = np.concatenate(all_actual)
    fold_id = np.concatenate(all_fold_id)

    print(f"\n{'=' * 60}\nSTEP 2 - NESTED CV: TRAINING THE STACKING META-MODEL\n{'=' * 60}")
    print("(Cheap - just fitting Linear Regression on 3 columns, 5 more times)")

    stacked_pred = np.zeros(len(actual))
    all_weights = []

    for meta_test_fold in range(N_FOLDS):
        meta_train_mask = fold_id != meta_test_fold
        meta_test_mask = fold_id == meta_test_fold

        X_meta_train = np.column_stack([
            ridge_pred[meta_train_mask], lgbm_pred[meta_train_mask], catboost_pred[meta_train_mask]
        ])
        X_meta_test = np.column_stack([
            ridge_pred[meta_test_mask], lgbm_pred[meta_test_mask], catboost_pred[meta_test_mask]
        ])

        meta_model = LinearRegression().fit(X_meta_train, actual[meta_train_mask])
        stacked_pred[meta_test_mask] = meta_model.predict(X_meta_test)
        all_weights.append(meta_model.coef_)

        print(f"  Meta-fold {meta_test_fold}: weights (ridge, lgbm, catboost) = "
              f"{meta_model.coef_.round(3)}, intercept={meta_model.intercept_:.4f}")

    avg_weights = np.mean(all_weights, axis=0)

    print(f"\n{'=' * 60}\nFINAL COMPARISON\n{'=' * 60}")
    print(f"  Average learned weights: ridge={avg_weights[0]:.3f}, "
          f"lgbm={avg_weights[1]:.3f}, catboost={avg_weights[2]:.3f}")

    results = {
        "Ridge alone": _metrics(actual, ridge_pred),
        "LightGBM alone": _metrics(actual, lgbm_pred),
        "CatBoost alone": _metrics(actual, catboost_pred),
        "Naive average ensemble": _metrics(actual, (lgbm_pred + catboost_pred) / 2),
        "Linear Stacking (Ridge+LGBM+CatBoost)": _metrics(actual, stacked_pred),
    }

    print()
    for method, m in results.items():
        print(f"  {method:40s} RMSE={m['rmse']:.4f}  MAE={m['mae']:.4f}")


if __name__ == "__main__":
    main()