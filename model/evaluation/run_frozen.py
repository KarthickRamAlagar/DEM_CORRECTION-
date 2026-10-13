"""Frozen final-test scoring (strip 3). Run ONCE. Scores: winner (LightGBM_L2_tuned), production recipe, raw DEM, constant-bias.
Also checks Mondrian conformal interval coverage on the frozen strip."""
import sys, json, pickle, time, warnings
from pathlib import Path
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor
from sklearn.linear_model import Ridge
HERE = Path(__file__).parent; ROOT = HERE.parent.parent; OUT = ROOT / "outputs"
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / "helpers"))
from data_v2 import load, split_objects
from features_v2 import TARGET, feature_sets
from spatial_split_v2 import frozen_masks
from metrics_v2 import summarize
SEED = 42
df = load(); fold, block_s, uniq, block_fold = split_objects(df)
feats = feature_sets(df.columns)["F29_parity_safe"]
X = df[feats].astype(np.float32); y = df[TARGET].values; void = df["is_void_flag"].values; region = df["terrain_region_class"].values
tr, te = frozen_masks(fold, block_s, uniq, block_fold)
print("train", tr.sum(), "frozen test", te.sum(), flush=True)
P = json.load(open(OUT / "optuna_best_params.json"))
p = dict(P["lgbm_l2"]); p.update(verbose=-1, n_jobs=2)
t = time.time(); lg = LGBMRegressor(**p).fit(X[tr], y[tr]); pw = lg.predict(X[te]); print("winner fit", int(time.time()-t), "s", flush=True)
med = X[tr].median().fillna(0)
rd = Ridge(alpha=10).fit(X[tr].fillna(med), y[tr]); pr = rd.predict(X[te].fillna(med))
lg1 = LGBMRegressor(n_estimators=200, num_leaves=63, learning_rate=0.05, random_state=SEED, verbose=-1, n_jobs=2).fit(X[tr], y[tr]); pl1 = lg1.predict(X[te])
cb = CatBoostRegressor(iterations=200, depth=10, learning_rate=0.05, random_state=SEED, verbose=False, thread_count=2).fit(X[tr], y[tr]); pc = cb.predict(X[te])
prod = 0.4422 * pr + 0.1400 * pl1 + 0.3622 * pc - 0.2202
yt = y[te]
cands = {"Raw DEM (no correction)": np.zeros(te.sum()), "Constant bias correction": np.full(te.sum(), y[tr].mean()),
         "Current production recipe (Ridge+LGBM+CatBoost, F29)": prod, "Ridge": pr, "LightGBM v1": pl1, "CatBoost v1": pc,
         "WINNER: LightGBM_L2_tuned": pw, "Avg(Ridge,LGBM_L2) [reference]": (pr + pw) / 2}
rows = []
for k, v in cands.items():
    s = summarize(yt, v, void[te], region[te]); s["model"] = k; rows.append(s)
res = pd.DataFrame(rows)[["model", "n", "RMSE", "MAE", "MedAE", "LE90", "Bias", "RMSE_nonvoid", "RMSE_plains", "RMSE_foothill"]].round(4)
res.to_csv(OUT / "frozen_strip_results.csv", index=False); print(res.to_string(), flush=True)

# ---- Mondrian conformal (calibration = out-of-fold residuals of the winner on CV strips; strip 3 untouched) ----
oofd = pickle.load(open(ROOT / "cache" / "tournament_oof.pkl", "rb"))
o = oofd["oof"]["LightGBM_L2_tuned"]; ev = ~np.isnan(o)
res_abs = np.abs(y[ev] - o[ev]); tri = df["tri"].values; reg = region
edges = np.nanquantile(tri[ev], [1/3, 2/3])
def grp(r, t): return (r.astype(int) * 3 + np.digitize(t, edges))
g_cal = grp(reg[ev], tri[ev]); g_te = grp(reg[te], tri[te])
ALPHA = 0.10; q = {}
for g in np.unique(g_cal):
    r = np.sort(res_abs[g_cal == g]); n = len(r); k = int(np.ceil((n + 1) * (1 - ALPHA))) - 1
    q[int(g)] = float(r[min(k, n - 1)])
qte = np.array([q.get(int(g), max(q.values())) for g in g_te])
cov = float(np.mean(np.abs(yt - pw) <= qte)); print("90% interval coverage on frozen strip:", round(cov, 4), "| mean half-width", round(float(qte.mean()), 3))
for g in sorted(q):
    m = g_te == g
    if m.sum(): print(f"  group {g} (region {g//3}, tri tercile {g%3}): q90={q[g]:.2f} n_frozen={m.sum()} coverage={np.mean(np.abs(yt[m]-pw[m])<=qte[m]):.3f}")
pd.Series({"edges": list(edges), "q90": q, "frozen_coverage": cov}).to_json(OUT / "conformal_check.json")
json.dump({"tri_edges": [float(e) for e in edges], "q90": q, "alpha": ALPHA, "calibration": "out-of-fold residuals, 4 CV strips, LightGBM_L2_tuned", "groups": "terrain_region_class*3 + tri tertile"}, open(OUT / "conformal_table.json", "w"), indent=2)
print("DONE", flush=True)
