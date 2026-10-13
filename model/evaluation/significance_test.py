"""
LE90 and Significance Testing - Modeling Phase, Step 5a

Answers the real open question: is the 0.027 RMSE gap between Ridge
Regression and the Ensemble actually statistically meaningful, or
indistinguishable from noise? And does LE90 (the PPT's actual named
headline metric) tell a different story than plain RMSE?

LE90, TWO WAYS:
1. Formula-based: 1.6449 x RMSE - traditional NMAS-style convention,
   assumes normally-distributed errors. Matches PPT Slide 14 exactly.
2. Empirical: actual 90th percentile of |residuals|, no normality
   assumption. Divergence from the formula version is itself a finding.

SIGNIFICANCE TEST: re-trains ONLY Ridge and the Ensemble (the two
models that matter for this question), saving every individual test
point's residual this time - previous scripts only kept fold-level
aggregate RMSE, not enough for a proper paired test. Pooling all 5
folds gives a large, powerful paired sample.

Run: uv run python model/evaluation/significance_test.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor
from scipy.stats import wilcoxon, ttest_rel

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


def le90_formula(rmse):
    return 1.6449 * rmse


def le90_empirical(abs_residuals):
    return np.percentile(abs_residuals, 90)


def main():
    print("=" * 60)
    print("LE90 AND SIGNIFICANCE TESTING - Ridge vs. Ensemble")
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

    all_ridge_residuals, all_ensemble_residuals = [], []
    all_ridge_abs, all_ensemble_abs = [], []

    for test_fold in range(N_FOLDS):
        print(f"\n--- Fold {test_fold} as test ---")
        excluded_blocks = compute_buffer_exclusions(unique_blocks, block_fold, test_fold, CELL_SIZE_KM, BUFFER_KM)
        test_df = df[df["_fold"] == test_fold]
        train_df = df[~df["_block"].isin(excluded_blocks)]
        y_test = test_df[target].values
        y_train = train_df[target].values

        X_train, X_test = impute_train_test(train_df, test_df, features, global_medians)
        ridge = Ridge(alpha=RIDGE_ALPHA).fit(X_train, y_train)
        pred_ridge = ridge.predict(X_test)

        lgbm = LGBMRegressor(**BEST_LGBM_PARAMS, random_state=RANDOM_SEED, verbose=-1)
        lgbm.fit(train_df[features], y_train)
        pred_lgbm = lgbm.predict(test_df[features])

        catboost = CatBoostRegressor(**BEST_CATBOOST_PARAMS, random_state=RANDOM_SEED, verbose=False)
        catboost.fit(train_df[features], y_train)
        pred_catboost = catboost.predict(test_df[features])
        pred_ensemble = (pred_lgbm + pred_catboost) / 2

        ridge_residuals = y_test - pred_ridge
        ensemble_residuals = y_test - pred_ensemble

        all_ridge_residuals.append(ridge_residuals)
        all_ensemble_residuals.append(ensemble_residuals)
        all_ridge_abs.append(np.abs(ridge_residuals))
        all_ensemble_abs.append(np.abs(ensemble_residuals))

        fold_rmse_ridge = np.sqrt(np.mean(ridge_residuals ** 2))
        fold_rmse_ensemble = np.sqrt(np.mean(ensemble_residuals ** 2))
        print(f"  Ridge RMSE={fold_rmse_ridge:.4f}   Ensemble RMSE={fold_rmse_ensemble:.4f}")

    ridge_abs_pooled = np.concatenate(all_ridge_abs)
    ensemble_abs_pooled = np.concatenate(all_ensemble_abs)

    overall_rmse_ridge = np.sqrt(np.mean(np.concatenate(all_ridge_residuals) ** 2))
    overall_rmse_ensemble = np.sqrt(np.mean(np.concatenate(all_ensemble_residuals) ** 2))

    print(f"\n{'=' * 60}\nLE90 RESULTS\n{'=' * 60}")
    print(f"  Ridge    - RMSE: {overall_rmse_ridge:.4f}")
    print(f"    LE90 (formula, 1.6449 x RMSE): {le90_formula(overall_rmse_ridge):.4f}")
    print(f"    LE90 (empirical, 90th %ile):    {le90_empirical(ridge_abs_pooled):.4f}")
    print(f"  Ensemble - RMSE: {overall_rmse_ensemble:.4f}")
    print(f"    LE90 (formula, 1.6449 x RMSE): {le90_formula(overall_rmse_ensemble):.4f}")
    print(f"    LE90 (empirical, 90th %ile):    {le90_empirical(ensemble_abs_pooled):.4f}")

    formula_vs_empirical_gap = le90_formula(overall_rmse_ridge) - le90_empirical(ridge_abs_pooled)
    if formula_vs_empirical_gap > 1.0:
        print(f"\n  NOTE: formula-based LE90 exceeds empirical LE90 by {formula_vs_empirical_gap:.2f}m -")
        print(f"  this is a real, meaningful divergence (verified: for genuinely normal errors,")
        print(f"  these two calculations agree closely - tested separately with synthetic normal")
        print(f"  data). This confirms the real elevation-error residuals are NOT normally")
        print(f"  distributed, consistent with the skewed, heavy-tailed error distribution")
        print(f"  already found in EDA. The EMPIRICAL LE90 should be treated as the trustworthy")
        print(f"  number to report - the formula version meaningfully overestimates true")
        print(f"  worst-case error for this dataset.")

    print(f"\n{'=' * 60}\nPAIRED SIGNIFICANCE TEST (n={len(ridge_abs_pooled):,} pooled test points)\n{'=' * 60}")
    print("Testing: are the Ensemble's absolute errors significantly LARGER than Ridge's?")
    print("(Corrected direction - the real RMSE numbers show Ridge winning, so this tests")
    print("whether that observed gap is statistically real, not the reverse claim)")

    stat_w, p_w = wilcoxon(ensemble_abs_pooled, ridge_abs_pooled, alternative="greater")
    stat_t, p_t = ttest_rel(ensemble_abs_pooled, ridge_abs_pooled, alternative="greater")

    print(f"\n  Wilcoxon signed-rank: statistic={stat_w:.1f}, p-value={p_w:.10f}")
    print(f"  Paired t-test:        statistic={stat_t:.4f}, p-value={p_t:.10f}")

    print(f"\n{'=' * 60}\nCONCLUSION\n{'=' * 60}")
    if p_w < 0.05:
        print("  Wilcoxon test: STATISTICALLY SIGNIFICANT (p < 0.05)")
        print("  -> Ridge's errors are genuinely, reliably smaller than the Ensemble's.")
        print("     Ridge Regression is the confirmed better model on this data.")
    else:
        print("  Wilcoxon test: NOT statistically significant (p >= 0.05)")
        print("  -> The difference cannot be distinguished from random variation at this")
        print("     sample size - Ridge and the Ensemble are statistically comparable.")


if __name__ == "__main__":
    main()