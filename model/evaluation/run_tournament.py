"""
Model tournament v2 (see outputs/selection_rule.md - declared before running).
Feature set F29_parity_safe; 4-fold spatial CV (strips 0,1,2,4); strip 3 never touched.
Training subsample per fold (speed); test = the whole held-out strip.
Optuna (TPE, seeded, time-capped) tunes LightGBM L2 and LightGBM Huber on a smaller subsample.
"""
import sys, time, json, pickle, warnings
from pathlib import Path
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)
from scipy.optimize import nnls
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor
from sklearn.linear_model import Ridge, ElasticNet
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import HistGradientBoostingRegressor, ExtraTreesRegressor, RandomForestRegressor
HERE = Path(__file__).parent; OUT = HERE.parent.parent / "outputs"
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / "helpers"))
from data_v2 import load, split_objects
from features_v2 import TARGET, feature_sets
from spatial_split_v2 import CV_FOLDS, cv_masks
from metrics_v2 import summarize

SEED = 42; N_SUB = 300_000; N_TREE_SUB = 150_000; N_OPT_SUB = 120_000; OPT_SECONDS = 420; NJ = 2
df = load(); fold, block_s, uniq, block_fold = split_objects(df)
feats = feature_sets(df.columns)["F29_parity_safe"]
X = df[feats].astype(np.float32); y = df[TARGET].values.astype(np.float64)
void = df["is_void_flag"].values; region = df["terrain_region_class"].values
masks = {f: cv_masks(fold, block_s, uniq, block_fold, f) for f in CV_FOLDS}
rng = np.random.default_rng(SEED)
sub = {f: rng.choice(np.where(masks[f][0])[0], size=min(N_SUB, masks[f][0].sum()), replace=False) for f in CV_FOLDS}
print("features", len(feats), "| CV rows:", {f: int(masks[f][1].sum()) for f in CV_FOLDS}, flush=True)

def impute_fit(idx): return X.iloc[idx].median().fillna(0)

def cv_predict(make, name, nan_ok, n_train=N_SUB):
    pred = np.full(len(df), np.nan); t0 = time.time()
    for f in CV_FOLDS:
        tr, te = masks[f]; idx = sub[f][:n_train]
        if nan_ok:
            m = make().fit(X.iloc[idx], y[idx]); pred[te] = m.predict(X[te])
        else:
            med = impute_fit(idx); m = make().fit(X.iloc[idx].fillna(med), y[idx]); pred[te] = m.predict(X[te].fillna(med))
    print(f"  {name:28s} done {time.time()-t0:5.0f}s", flush=True)
    return pred

# ---------------- Optuna (LightGBM L2 + Huber) ----------------
opt_sub = {f: sub[f][:N_OPT_SUB] for f in CV_FOLDS}
opt_te = {f: np.where(masks[f][1])[0][::8] for f in CV_FOLDS}   # every 8th test row: fast, unbiased
def lgb_params(trial, huber):
    p = dict(n_estimators=trial.suggest_int("n_estimators", 150, 500), learning_rate=trial.suggest_float("learning_rate", 0.02, 0.12, log=True),
             num_leaves=trial.suggest_int("num_leaves", 15, 127), min_child_samples=trial.suggest_int("min_child_samples", 20, 400),
             reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 50, log=True), colsample_bytree=trial.suggest_float("colsample_bytree", 0.5, 1.0),
             subsample=trial.suggest_float("subsample", 0.5, 1.0), subsample_freq=1, random_state=SEED, verbose=-1, n_jobs=NJ)
    if huber: p.update(objective="huber", alpha=trial.suggest_float("huber_alpha", 0.5, 5.0))
    return p
def make_objective(huber):
    def obj(trial):
        p = lgb_params(trial, huber); se = 0.0; n = 0
        for f in CV_FOLDS:
            m = LGBMRegressor(**p).fit(X.iloc[opt_sub[f]], y[opt_sub[f]]); e = y[opt_te[f]] - m.predict(X.iloc[opt_te[f]])
            se += float(np.sum(e ** 2)); n += len(e)
        return np.sqrt(se / n)
    return obj
best = {}
for huber, nm in [(False, "lgbm_l2"), (True, "lgbm_huber")]:
    st = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=SEED))
    st.optimize(make_objective(huber), timeout=OPT_SECONDS, n_jobs=1)
    best[nm] = lgb_params(optuna.trial.FixedTrial(st.best_params), huber)
    print(f"Optuna {nm}: {len(st.trials)} trials, best CV RMSE (subsample) {st.best_value:.4f}", st.best_params, flush=True)
json.dump({k: {a: b for a, b in v.items() if a not in ("verbose", "n_jobs")} for k, v in best.items()}, open(OUT / "optuna_best_params.json", "w"), indent=2)

# ---------------- candidates ----------------
cands = {
 "Ridge(a=10)":        (lambda: Ridge(alpha=10), False, N_SUB),
 "Ridge(a=100)":       (lambda: Ridge(alpha=100), False, N_SUB),
 "ElasticNet":         (lambda: make_pipeline(StandardScaler(), ElasticNet(alpha=0.01, l1_ratio=0.5, max_iter=2000)), False, N_SUB),
 "LightGBM_v1":        (lambda: LGBMRegressor(n_estimators=200, num_leaves=63, learning_rate=0.05, random_state=SEED, verbose=-1, n_jobs=NJ), True, N_SUB),
 "LightGBM_L2_tuned":  (lambda: LGBMRegressor(**best["lgbm_l2"]), True, N_SUB),
 "LightGBM_Huber_tuned": (lambda: LGBMRegressor(**best["lgbm_huber"]), True, N_SUB),
 "CatBoost_v1":        (lambda: CatBoostRegressor(iterations=200, depth=10, learning_rate=0.05, random_state=SEED, verbose=False, thread_count=NJ), True, N_SUB),
 "HistGradientBoosting": (lambda: HistGradientBoostingRegressor(max_iter=300, learning_rate=0.08, max_leaf_nodes=63, random_state=SEED), True, N_SUB),
 "ExtraTrees":         (lambda: ExtraTreesRegressor(n_estimators=100, min_samples_leaf=5, max_features=0.6, n_jobs=NJ, random_state=SEED), False, N_TREE_SUB),
 "RandomForest":       (lambda: RandomForestRegressor(n_estimators=80, max_depth=16, min_samples_leaf=5, max_features=0.5, n_jobs=NJ, random_state=SEED), False, N_TREE_SUB),
}
oof = {}
for name, (mk, nan_ok, n_tr) in cands.items():
    oof[name] = cv_predict(mk, name, nan_ok, n_tr)
ev = ~np.isnan(oof["Ridge(a=10)"])

# ---------------- ensembles (weights learned leave-one-strip-out => no peeking) ----------------
def nnls_oof(names, intercept):
    out = np.full(len(df), np.nan); W = []
    P = np.column_stack([oof[n] for n in names])
    for f in CV_FOLDS:
        te = masks[f][1]; trm = ev & ~te
        A = P[trm]; 
        if intercept: A = np.column_stack([A, np.ones(len(A))])
        w, _ = nnls(A, y[trm]); W.append(w)
        B = P[te]; 
        if intercept: B = np.column_stack([B, np.ones(len(B))])
        out[te] = B @ w
    return out, np.mean(W, axis=0)
ens = {}
ens["Avg(Ridge,LGBM_L2)"] = (oof["Ridge(a=10)"] + oof["LightGBM_L2_tuned"]) / 2
ens["Avg(Ridge,LGBM_Huber)"] = (oof["Ridge(a=10)"] + oof["LightGBM_Huber_tuned"]) / 2
ens["Avg(Ridge,LGBM_Huber,CatBoost)"] = (oof["Ridge(a=10)"] + oof["LightGBM_Huber_tuned"] + oof["CatBoost_v1"]) / 3
ens["Avg(LGBM_Huber,CatBoost,ExtraTrees)"] = (oof["LightGBM_Huber_tuned"] + oof["CatBoost_v1"] + oof["ExtraTrees"]) / 3
ens["Avg(Ridge,LGBM_Huber,CatBoost,ExtraTrees)"] = (oof["Ridge(a=10)"] + oof["LightGBM_Huber_tuned"] + oof["CatBoost_v1"] + oof["ExtraTrees"]) / 4
base_names = ["Ridge(a=10)", "LightGBM_Huber_tuned", "LightGBM_L2_tuned", "CatBoost_v1", "ExtraTrees", "HistGradientBoosting"]
ens["NNLS weights (6 models, no intercept)"], w1 = nnls_oof(base_names, False)
ens["NNLS stack (6 models, intercept)"], w2 = nnls_oof(base_names, True)
print("NNLS weights:", dict(zip(base_names, np.round(w1, 3))), "| with intercept:", np.round(w2, 3), flush=True)
allp = {**oof, **ens}
rows = []
for name, p in allp.items():
    s = summarize(y[ev], p[ev], void[ev], region[ev])
    fr = [np.sqrt(np.mean((y[masks[f][1]] - p[masks[f][1]]) ** 2)) for f in CV_FOLDS]
    s.update(model=name, worst_fold_RMSE=max(fr), **{f"fold{f}_RMSE": r for f, r in zip(CV_FOLDS, fr)}); rows.append(s)
res = pd.DataFrame(rows).sort_values("RMSE")
cols = ["model", "RMSE", "RMSE_nonvoid", "MAE", "MedAE", "LE90", "Bias", "RMSE_plains", "RMSE_foothill", "worst_fold_RMSE"] + [f"fold{f}_RMSE" for f in CV_FOLDS]
res[cols].round(4).to_csv(OUT / "tournament_cv.csv", index=False)
pickle.dump({"oof": allp, "weights": {"names": base_names, "nnls": w1, "nnls_intercept": w2}, "ev": ev}, open(HERE.parent.parent / "cache" / "tournament_oof.pkl", "wb"))
print(res[cols].round(3).to_string(), flush=True)
print("DONE", flush=True)
