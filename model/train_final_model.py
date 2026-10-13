"""
Final Model Training and Persistence - Modeling Phase, Step 6

Trains and saves the Linear Stacking ensemble (Ridge + LightGBM +
CatBoost), confirmed as the real winner (RMSE 3.3130 vs. Ridge alone's
3.3722) via honest nested cross-validation.

IMPORTANT DESIGN DECISION: the meta-model's combination weights were
learned from OUT-OF-FOLD base predictions during validation - that's
what made the nested CV honest. If we naively retrained all 3 base
models on the FULL dataset and then re-fit a NEW meta-model on THEIR
predictions, those predictions would be in-sample (each model
predicting on data it just trained on), reintroducing exactly the kind
of overfitting/leakage the nested CV process was built to avoid.

Fixed by using the ALREADY-VALIDATED weights directly, averaged across
the 5 meta-folds from stacking_ensemble.py's real run:
    ridge=0.4422, lgbm=0.1400, catboost=0.3622, intercept=-0.2202
These become fixed constants - the 3 base models are retrained on the
full dataset (to learn from everything available), but combined using
weights whose honesty was already proven, not re-derived from
potentially-overfit new predictions.

Run: uv run python model/train_final_model.py
"""

import sys
import joblib
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent / "helpers"))

from dem_correction.config import DATA_FINAL
from feature_selection import get_model_features, get_target_column

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
MODEL_OUTPUT_DIR = Path(__file__).parent / "saved"

RIDGE_ALPHA = 10.0
BEST_LGBM_PARAMS = {"n_estimators": 200, "num_leaves": 63, "max_depth": -1, "learning_rate": 0.05}
BEST_CATBOOST_PARAMS = {"iterations": 200, "depth": 10, "learning_rate": 0.05}

META_WEIGHTS = {"ridge": 0.4422, "lgbm": 0.1400, "catboost": 0.3622, "intercept": -0.2202}
RANDOM_SEED = 42


def main():
    print("=" * 60)
    print("TRAINING FINAL PRODUCTION MODEL - Linear Stacking Ensemble")
    print("=" * 60)

    features = get_model_features()
    target = get_target_column()
    print(f"\nUsing {len(features)} features, target: {target}")

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH, columns=features + [target])
    print(f"  Loaded {len(df):,} rows - training all 3 base models on ALL of them")

    print("\nComputing imputation medians (for Ridge's missing SAR features)...")
    medians = df[features].median()
    X_imputed = df[features].fillna(medians)
    y = df[target].values

    print(f"\nTraining Ridge Regression (alpha={RIDGE_ALPHA})...")
    ridge = Ridge(alpha=RIDGE_ALPHA).fit(X_imputed, y)

    print(f"\nTraining LightGBM {BEST_LGBM_PARAMS}...")
    lgbm = LGBMRegressor(**BEST_LGBM_PARAMS, random_state=RANDOM_SEED, verbose=-1)
    lgbm.fit(df[features], y)

    print(f"\nTraining CatBoost {BEST_CATBOOST_PARAMS}...")
    catboost = CatBoostRegressor(**BEST_CATBOOST_PARAMS, random_state=RANDOM_SEED, verbose=False)
    catboost.fit(df[features], y)

    print("\nVerifying the stacked formula on training data (sanity check only -")
    print("real validated performance is the 3.3130 RMSE from stacking_ensemble.py)...")
    pred_ridge = ridge.predict(X_imputed)
    pred_lgbm = lgbm.predict(df[features])
    pred_catboost = catboost.predict(df[features])
    pred_stacked = (
        META_WEIGHTS["ridge"] * pred_ridge
        + META_WEIGHTS["lgbm"] * pred_lgbm
        + META_WEIGHTS["catboost"] * pred_catboost
        + META_WEIGHTS["intercept"]
    )
    train_rmse = np.sqrt(np.mean((y - pred_stacked) ** 2))
    print(f"  Training-set RMSE: {train_rmse:.4f} (expected to look better than 3.3130 -")
    print(f"  this is in-sample, not a fair validation number)")

    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    artifact = {
        "ridge_model": ridge,
        "lgbm_model": lgbm,
        "catboost_model": catboost,
        "meta_weights": META_WEIGHTS,
        "imputation_medians": medians,
        "feature_order": features,
        "target_name": target,
        "validated_rmse": 3.3130,
        "validated_mae": 1.7214,
        "model_type": "Linear Stacking (Ridge + LightGBM + CatBoost)",
    }

    output_path = MODEL_OUTPUT_DIR / "dem_correction_model.pkl"
    joblib.dump(artifact, output_path)

    print(f"\nSaved: {output_path}")
    print(f"\nThis single file now contains everything a prediction API needs:")
    print(f"  - All 3 trained base models")
    print(f"  - The honest, validated combination weights")
    print(f"  - Imputation values for missing features")
    print(f"  - The exact feature order the models expect")
    print(f"  - The real, honest validated performance numbers (RMSE 3.3130)")


if __name__ == "__main__":
    main()