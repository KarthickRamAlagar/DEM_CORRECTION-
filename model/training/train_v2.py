"""
Train + register DEM-correction model v2 (additive: the old dem_correction_model.pkl is NOT touched).
Winner chosen by the pre-declared rule in outputs/selection_rule.md: LightGBM (tuned, L2) on the 29 parity-safe features.
Ridge and CatBoost are fitted as *reference* models only (they feed the 'individual_predictions' / agreement check; they do not change the prediction).
Run: uv run python model/training/train_v2.py
"""
import sys, json, hashlib, datetime
from pathlib import Path
import numpy as np, pandas as pd, joblib
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor
from sklearn.linear_model import Ridge
HERE = Path(__file__).parent; MODEL_DIR = HERE.parent; ROOT = MODEL_DIR.parent
sys.path.insert(0, str(MODEL_DIR / "evaluation")); sys.path.insert(0, str(MODEL_DIR / "helpers"))
from data_v2 import load, dataset_path
from features_v2 import TARGET, feature_sets
SEED = 42
OUT = ROOT / "outputs"; SAVED = MODEL_DIR / "saved"; SAVED.mkdir(exist_ok=True)

df = load(); feats = feature_sets(df.columns)["F29_parity_safe"]
X = df[feats].astype(np.float32); y = df[TARGET].values
params = json.load(open(OUT / "optuna_best_params.json"))["lgbm_l2"]
conf = json.load(open(OUT / "conformal_table.json"))
frozen = pd.read_csv(OUT / "frozen_strip_results.csv").set_index("model")
cv = pd.read_csv(OUT / "tournament_cv.csv").set_index("model")

print("fitting winner on all", len(df), "rows ...", flush=True)
lgbm = LGBMRegressor(**params, verbose=-1, n_jobs=2).fit(X, y)
medians = X.median().fillna(0)
ridge = Ridge(alpha=10).fit(X.fillna(medians), y)
lgbm_v1 = LGBMRegressor(n_estimators=200, num_leaves=63, learning_rate=0.05, random_state=SEED, verbose=-1, n_jobs=2).fit(X, y)
print("fitting CatBoost reference ...", flush=True)
cat = CatBoostRegressor(iterations=200, depth=10, learning_rate=0.05, random_state=SEED, verbose=False, thread_count=2).fit(X, y)

# global SHAP (exact TreeSHAP via LightGBM pred_contrib) on a fixed random sample
idx = np.random.default_rng(SEED).choice(len(df), 50_000, replace=False)
contrib = lgbm.predict(X.iloc[idx], pred_contrib=True)
shap_global = pd.Series(np.abs(contrib[:, :-1]).mean(0), index=feats).sort_values(ascending=False)
shap_global.round(5).to_json(OUT / "shap_global_importance.json")

sha = hashlib.sha256(); 
with open(dataset_path(), "rb") as f:
    for chunk in iter(lambda: f.read(1 << 24), b""): sha.update(chunk)
w = "WINNER: LightGBM_L2_tuned"; prod = "Current production recipe (Ridge+LGBM+CatBoost, F29)"
registry = {
  "model_version": "v2.0.0", "created_utc": datetime.datetime.utcnow().isoformat() + "Z",
  "algorithm": "LightGBM (Optuna-tuned, L2) on 29 parity-safe features",
  "target": "elevation_error_signed = elevation_ref - raw_z ; corrected = raw_z + predicted_error",
  "dataset": {"file": "golden_dataset.parquet", "rows": int(len(df)), "sha256": sha.hexdigest()},
  "feature_schema": feats, "hyperparameters": params,
  "validation": {
    "design": "10 km blocks, 5 km buffer, 5 longitude strips (seed 42); strip 3 frozen final test; selection by 4-strip spatial CV",
    "cv_4strip_pooled": cv.loc["LightGBM_L2_tuned", ["RMSE", "MAE", "MedAE", "LE90", "Bias"]].to_dict(),
    "frozen_strip": frozen.loc[w, ["n", "RMSE", "MAE", "MedAE", "LE90", "Bias", "RMSE_nonvoid", "RMSE_plains", "RMSE_foothill"]].to_dict(),
    "frozen_strip_raw_dem": frozen.loc["Raw DEM (no correction)", ["RMSE", "MAE"]].to_dict(),
    "frozen_strip_old_recipe": frozen.loc[prod, ["RMSE", "MAE"]].to_dict(),
    "note": "CV models used a 300k-row training subsample per fold; frozen-strip model used all rows outside strip 3 + buffer; final artifact uses all rows."},
  "intervals": conf, "selection_rule": "outputs/selection_rule.md",
  "known_limits": ["Study area is Gangetic Plain with Himalayan foothill margin (lat 25-28N), not high Himalaya",
                   "90% conformal interval covered ~85.5% on the unseen frozen strip (spatial shift); treat as approximate"],
}
json.dump(registry, open(SAVED / "registry.json", "w"), indent=2, default=float)
artifact = {"lgbm_model": lgbm, "ridge_model": ridge, "lgbm_v1_model": lgbm_v1, "catboost_model": cat,
            "imputation_medians": medians, "feature_order": feats, "conformal": conf,
            "model_version": "v2.0.0", "model_type": "LightGBM tuned (v2) with Ridge/CatBoost reference check",
            "validated_rmse": round(float(registry["validation"]["frozen_strip"]["RMSE"]), 4),
            "validated_mae": round(float(registry["validation"]["frozen_strip"]["MAE"]), 4),
            "shap_global": shap_global.to_dict()}
joblib.dump(artifact, SAVED / "dem_correction_model_v2.pkl")
print("saved", SAVED / "dem_correction_model_v2.pkl"); print(shap_global.head(10).round(3).to_string()); print("DONE")
