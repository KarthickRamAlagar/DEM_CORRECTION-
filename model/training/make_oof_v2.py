"""Out-of-fold predictions for the Dashboard: every point is predicted by a model that never saw its own longitude strip (or the 5 km buffer).
Output: model/saved/oof_predictions.parquet (latitude, longitude, elevation_error_signed, oof_pred, fold)."""
import sys, json
from pathlib import Path
import numpy as np, pandas as pd
from lightgbm import LGBMRegressor
MODEL_DIR = Path(__file__).parent.parent; ROOT = MODEL_DIR.parent
sys.path.insert(0, str(MODEL_DIR / "evaluation")); sys.path.insert(0, str(MODEL_DIR / "helpers"))
from data_v2 import load, split_objects
from features_v2 import TARGET, feature_sets
from spatial_split import compute_buffer_exclusions
from spatial_split_v2 import CELL_KM, BUFFER_KM
df = load(); fold, block_s, uniq, block_fold = split_objects(df)
feats = feature_sets(df.columns)["F29_parity_safe"]; X = df[feats].astype(np.float32); y = df[TARGET].values
p = json.load(open(ROOT / "outputs" / "optuna_best_params.json"))["lgbm_l2"]; p.update(verbose=-1, n_jobs=2)
oof = np.full(len(df), np.nan)
for f in range(5):
    excl = compute_buffer_exclusions(uniq, block_fold, f, CELL_KM, BUFFER_KM)
    tr = ~np.fromiter((b in excl for b in block_s), dtype=bool, count=len(block_s)); te = fold == f
    oof[te] = LGBMRegressor(**p).fit(X[tr], y[tr]).predict(X[te]); print(f, int(te.sum()), flush=True)
out = pd.DataFrame({"latitude": df["latitude"].values, "longitude": df["longitude"].values, "elevation_error_signed": y, "oof_pred": oof, "fold": fold})
out.to_parquet(MODEL_DIR / "saved" / "oof_predictions.parquet", index=False)
e = y - oof; print("overall OOF RMSE", np.sqrt(np.mean(e**2)), "raw RMSE", np.sqrt(np.mean(y**2)), "nan", int(np.isnan(oof).sum()))
