"""
Feature-set test under frozen-strip CV (strips 0,1,2,4). Ridge + LightGBM, training subsample for speed.
Question answered with data, not assumption: what does dropping radar / date-proxy / parity-risk inputs cost?
"""
import sys, time, json
from pathlib import Path
import numpy as np, pandas as pd
from lightgbm import LGBMRegressor
from sklearn.linear_model import Ridge
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / "helpers"))
from data_v2 import load, split_objects
from features_v2 import TARGET, feature_sets
from spatial_split_v2 import CV_FOLDS, cv_masks
from metrics_v2 import summarize

N_SUB = 300_000; SEED = 42
df = load(); fold, block_s, uniq, block_fold = split_objects(df)
y = df[TARGET].values.astype(np.float64); void = df["is_void_flag"].values; region = df["terrain_region_class"].values
sets = feature_sets(df.columns)
masks = {f: cv_masks(fold, block_s, uniq, block_fold, f) for f in CV_FOLDS}
rng = np.random.default_rng(SEED)
rows = []; oof_all = {}
for name, feats in sets.items():
    X = df[feats].astype(np.float32)
    for algo in ["Ridge", "LightGBM"]:
        pred = np.full(len(df), np.nan); fr = {}
        t0 = time.time()
        for f in CV_FOLDS:
            tr, te = masks[f]
            idx = np.where(tr)[0]; idx = rng.choice(idx, size=min(N_SUB, len(idx)), replace=False)
            if algo == "Ridge":
                med = X.iloc[idx].median().fillna(0)
                m = Ridge(alpha=10).fit(X.iloc[idx].fillna(med), y[idx]); pred[te] = m.predict(X[te].fillna(med))
            else:
                m = LGBMRegressor(n_estimators=200, num_leaves=63, learning_rate=0.05, random_state=SEED, verbose=-1, n_jobs=2).fit(X.iloc[idx], y[idx])
                pred[te] = m.predict(X[te])
            fr[f] = float(np.sqrt(np.mean((y[te] - pred[te]) ** 2)))
        ev = ~np.isnan(pred)
        s = summarize(y[ev], pred[ev], void[ev], region[ev]); s.update(features=name, n_features=len(feats), algo=algo, worst_fold_RMSE=max(fr.values()), secs=round(time.time() - t0))
        rows.append(s); print(name, algo, round(s["RMSE"], 3), round(s["RMSE_nonvoid"], 3), "worst fold", round(s["worst_fold_RMSE"], 2), flush=True)
out = pd.DataFrame(rows)[["features", "n_features", "algo", "RMSE", "RMSE_nonvoid", "MAE", "MedAE", "LE90", "Bias", "RMSE_plains", "RMSE_foothill", "worst_fold_RMSE", "secs"]]
Path(HERE.parent.parent / "outputs").mkdir(exist_ok=True)
out.round(4).to_csv(HERE.parent.parent / "outputs" / "feature_sets.csv", index=False)
print(out.round(3).to_string())
