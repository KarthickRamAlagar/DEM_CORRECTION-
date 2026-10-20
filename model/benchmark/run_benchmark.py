"""
Full-data benchmark study (Assignment-02 phases, run on ALL golden-dataset rows) -> SQLite results DB.
Computed ONCE; the Evaluation page only reads the DB. Resumable: every (stage, protocol, config, model) result is saved
as soon as it finishes and is skipped on the next run, so you can stop (Ctrl+C) and continue any time.

Phases covered (Assignment-02 numbering)      stage name
  3-4  preprocessing + feature configurations  config
  5-7  split, CV, 14 models + ensembles        benchmark, ensembles
  8-9  feature selection (6 methods)           featsel
  10   hyper-parameter tuning (Grid/Random/Optuna)  tuning
  11-12 final held-out test + DEM correction   final
  --   does the full-data result contradict our model decision?   decision
  --   import of results we already have (spatial CV, frozen strip)  import
Skipped on purpose (already in the app): EDA, dataset overview, SHAP.

Two protocols, identical models, identical training size:
  random  : 80/20 random split stratified on target deciles + 5-fold random CV on the 80%
  spatial : 10 km blocks, 5 km buffer, 4-strip CV (strip 3 = frozen test, never used here)

Run (from repo root):  uv run python model/benchmark/run_benchmark.py --stages all
Quick self-test:       uv run python model/benchmark/run_benchmark.py --rows 30000 --db model/saved/benchmark_sample.db
"""
import argparse, json, os, sqlite3, sys, time, warnings
from datetime import datetime, timezone
from pathlib import Path
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
from scipy.optimize import nnls
from sklearn.model_selection import KFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet, LassoCV
from sklearn.neighbors import KNeighborsRegressor
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import (RandomForestRegressor, ExtraTreesRegressor, GradientBoostingRegressor,
                              HistGradientBoostingRegressor, BaggingRegressor)
from sklearn.feature_selection import mutual_info_regression, f_regression, RFE
from lightgbm import LGBMRegressor
from catboost import CatBoostRegressor

HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent; OUT = ROOT / "outputs"
sys.path.insert(0, str(HERE.parent / "evaluation")); sys.path.insert(0, str(HERE.parent / "helpers"))
from data_v2 import load, split_objects
from features_v2 import TARGET, feature_sets
from spatial_split_v2 import CV_FOLDS, cv_masks

ap = argparse.ArgumentParser()
ap.add_argument("--stages", default="all"); ap.add_argument("--db", default=str(ROOT / "model" / "saved" / "benchmark.db"))
ap.add_argument("--rows", type=int, default=0, help="0 = ALL rows. Use e.g. 30000 only for a self-test.")
ap.add_argument("--seed", type=int, default=42); ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
ap.add_argument("--cv-train", type=int, default=300_000, help="max training rows per CV fold (same design as our spatial tournament)")
ap.add_argument("--svr-train", type=int, default=30_000); ap.add_argument("--knn-train", type=int, default=300_000)
ap.add_argument("--slow-eval", type=int, default=50_000, help="max validation rows per fold for SVR/KNN")
ap.add_argument("--only", default="", help="comma list of model names to run in 'benchmark' (default all)")
ap.add_argument("--trials", type=int, default=20)
A = ap.parse_args()
SEED, NJ = A.seed, A.jobs
STAGES = ["import", "config", "benchmark", "ensembles", "featsel", "tuning", "final", "decision"]
run_stages = STAGES if A.stages == "all" else A.stages.split(",")

# ------------------------------------------------------------------ DB
Path(A.db).parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(A.db); db.execute("PRAGMA journal_mode=WAL")
db.executescript("""
CREATE TABLE IF NOT EXISTS results(stage TEXT, protocol TEXT, config TEXT, model TEXT, n_train INTEGER, n_eval INTEGER,
  rmse REAL, mae REAL, r2 REAL, rmse_std REAL, fit_seconds REAL, note TEXT, extra TEXT, source TEXT, created_utc TEXT,
  PRIMARY KEY(stage, protocol, config, model));
CREATE TABLE IF NOT EXISTS folds(stage TEXT, protocol TEXT, config TEXT, model TEXT, fold INTEGER, rmse REAL, mae REAL, r2 REAL,
  n_train INTEGER, n_eval INTEGER, PRIMARY KEY(stage, protocol, config, model, fold));
CREATE TABLE IF NOT EXISTS samples(protocol TEXT, model TEXT, kind TEXT, payload TEXT, PRIMARY KEY(protocol, model, kind));
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
""")
def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")
def done(stage, protocol, config, model):
    return db.execute("SELECT 1 FROM results WHERE stage=? AND protocol=? AND config=? AND model=?", (stage, protocol, config, model)).fetchone() is not None
def save(stage, protocol, config, model, n_train, n_eval, rmse, mae, r2, rmse_std=None, secs=None, note="", extra=None, source="computed"):
    db.execute("INSERT OR REPLACE INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (stage, protocol, config, model, n_train, n_eval, rmse, mae, r2, rmse_std, secs, note,
                json.dumps(extra) if extra is not None else None, source, now())); db.commit()
def save_fold(stage, protocol, config, model, k, rmse, mae, r2, ntr, nev):
    db.execute("INSERT OR REPLACE INTO folds VALUES (?,?,?,?,?,?,?,?,?,?)", (stage, protocol, config, model, k, rmse, mae, r2, ntr, nev)); db.commit()
def set_meta(k, v): db.execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (k, json.dumps(v))); db.commit()
def log(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)

# ------------------------------------------------------------------ data + splits
df = load(); fold, block_s, uniq, block_fold = split_objects(df)
rng = np.random.default_rng(SEED)
keep = np.ones(len(df), bool)
if A.rows and A.rows < len(df): keep[:] = False; keep[rng.choice(len(df), A.rows, replace=False)] = True
FS = feature_sets(df.columns); F29 = FS["F29_parity_safe"]
y_all = df[TARGET].values.astype(np.float64); region = df["terrain_region_class"].values
XF = {}   # cache of float32 frames per feature list
def Xof(cols):
    key = tuple(cols)
    if key not in XF: XF[key] = df[list(cols)].astype(np.float32)
    return XF[key]
set_meta("n_rows_total", int(keep.sum())); set_meta("n_rows_dataset", int(len(df))); set_meta("self_test_subsample", bool(A.rows))
set_meta("target_stats", {"mean": float(y_all[keep].mean()), "std": float(y_all[keep].std()), "min": float(y_all[keep].min()), "max": float(y_all[keep].max())})
set_meta("target_formula", "elevation_error_signed = elevation_ref - raw_z ; corrected = raw_z + predicted_error")
set_meta("design", {"cv_train_cap": A.cv_train, "svr_train_cap": A.svr_train, "knn_train_cap": A.knn_train, "slow_eval_cap": A.slow_eval, "seed": SEED})

# random protocol: 80/20 stratified holdout + 5-fold CV on the 80%
idx_all = np.where(keep)[0]
strat = pd.qcut(y_all[idx_all], 10, labels=False, duplicates="drop")
R_train, R_test = train_test_split(idx_all, test_size=0.2, random_state=SEED, stratify=strat)
R_splits = [(R_train[a], R_train[b]) for a, b in KFold(5, shuffle=True, random_state=SEED).split(R_train)]
# spatial protocol: 4 strips, 5 km buffer (frozen strip never used here)
S_splits = []
for f in CV_FOLDS:
    tr, te = cv_masks(fold, block_s, uniq, block_fold, f)
    S_splits.append((np.where(tr & keep)[0], np.where(te & keep)[0]))
PROTO = {"random": R_splits, "spatial": S_splits}
set_meta("split_sizes", {"random_train": int(len(R_train)), "random_test": int(len(R_test)), "spatial_cv_rows": int(sum(len(b) for _, b in S_splits))})
log(f"rows used {int(keep.sum()):,} | random train/test {len(R_train):,}/{len(R_test):,} | spatial CV rows {sum(len(b) for _, b in S_splits):,}")

# ------------------------------------------------------------------ models
_op = OUT / "optuna_best_params.json"
if _op.exists(): P_L2 = json.load(open(_op))["lgbm_l2"]
else: P_L2 = json.load(open(ROOT / "model" / "saved" / "registry.json"))["hyperparameters"]   # same tuned model, recorded at training time
def imp(m, scale=False):
    steps = [SimpleImputer(strategy="median")] + ([StandardScaler()] if scale else []) + [m]; return make_pipeline(*steps)
MODELS = {   # name: (factory, train_cap, eval_cap, note)
 "Dummy Mean":              (lambda: DummyRegressor(strategy="mean"), None, None, ""),
 "Linear Regression":       (lambda: imp(LinearRegression(), True), None, None, ""),
 "Ridge":                   (lambda: imp(Ridge(alpha=10), True), None, None, ""),
 "Lasso":                   (lambda: imp(Lasso(alpha=0.01, max_iter=5000), True), None, None, ""),
 "ElasticNet":              (lambda: imp(ElasticNet(alpha=0.01, l1_ratio=0.5, max_iter=5000), True), None, None, ""),
 "KNN":                     (lambda: imp(KNeighborsRegressor(n_neighbors=10, n_jobs=NJ), True), A.knn_train, A.slow_eval, "capped (distance search is slow)"),
 "SVR":                     (lambda: imp(SVR(C=3.0, epsilon=0.2), True), A.svr_train, A.slow_eval, "capped (SVR cost grows with n^2)"),
 "Decision Tree":           (lambda: imp(DecisionTreeRegressor(min_samples_leaf=5, random_state=SEED)), None, None, ""),
 "Bagging + Decision Tree": (lambda: imp(BaggingRegressor(DecisionTreeRegressor(min_samples_leaf=5), n_estimators=30, max_samples=0.5, n_jobs=NJ, random_state=SEED)), None, None, ""),
 "Random Forest":           (lambda: imp(RandomForestRegressor(n_estimators=100, max_depth=20, min_samples_leaf=5, max_features=0.5, n_jobs=NJ, random_state=SEED)), None, None, "depth/leaf limits set for scale"),
 "Extra Trees":             (lambda: imp(ExtraTreesRegressor(n_estimators=100, min_samples_leaf=5, max_features=0.6, n_jobs=NJ, random_state=SEED)), None, None, "leaf limit set for scale"),
 "Gradient Boosting":       (lambda: imp(GradientBoostingRegressor(n_estimators=100, max_depth=5, subsample=0.5, random_state=SEED)), None, None, ""),
 "Hist Gradient Boosting":  (lambda: HistGradientBoostingRegressor(max_iter=300, learning_rate=0.08, max_leaf_nodes=63, random_state=SEED), None, None, ""),
 "LightGBM (default)":      (lambda: LGBMRegressor(n_estimators=200, num_leaves=63, learning_rate=0.05, random_state=SEED, verbose=-1, n_jobs=NJ), None, None, ""),
 "CatBoost":                (lambda: CatBoostRegressor(iterations=200, depth=10, learning_rate=0.05, random_state=SEED, verbose=False, thread_count=NJ), None, None, ""),
 "LightGBM (tuned, production)": (lambda: LGBMRegressor(**{**P_L2, "verbose": -1, "n_jobs": NJ}), None, None, "Optuna-tuned on spatial CV"),
}
FAMILY = {"Dummy Mean": "Baseline", "Linear Regression": "Linear", "Ridge": "Linear", "Lasso": "Linear", "ElasticNet": "Linear", "KNN": "Instance-based",
          "SVR": "Kernel", "Decision Tree": "Tree", "Bagging + Decision Tree": "Bagging", "Random Forest": "Bagging", "Extra Trees": "Bagging",
          "Gradient Boosting": "Boosting", "Hist Gradient Boosting": "Boosting", "LightGBM (default)": "Boosting", "CatBoost": "Boosting",
          "LightGBM (tuned, production)": "Boosting"}
def metrics(y, p):
    e = y - p; ss = np.sum((y - y.mean()) ** 2)
    return float(np.sqrt(np.mean(e ** 2))), float(np.mean(np.abs(e))), float(1 - np.sum(e ** 2) / ss) if ss > 0 else float("nan")
OOF_DIR = Path(A.db).with_suffix(".oof"); OOF_DIR.mkdir(exist_ok=True)
def sub(idx, cap, r): return idx if (cap is None or len(idx) <= cap) else r.choice(idx, cap, replace=False)

def cv_eval(stage, protocol, config, name, factory, cols, train_cap=None, eval_cap=None, note="", save_oof=True):
    if done(stage, protocol, config, name): return
    t0 = time.time(); X = Xof(cols); r = np.random.default_rng(SEED)
    cap = A.cv_train if train_cap is None else min(train_cap, A.cv_train)
    oof = np.full(len(df), np.nan, dtype=np.float32); per = []; ntr_l = []; nev_l = []
    for k, (tr, va) in enumerate(PROTO[protocol]):
        tri = sub(tr, cap, r); vai = sub(va, eval_cap, r)
        m = factory().fit(X.iloc[tri], y_all[tri]); p = m.predict(X.iloc[vai]); oof[vai] = p
        rm, ma, r2 = metrics(y_all[vai], p); per.append((rm, ma, r2)); ntr_l.append(len(tri)); nev_l.append(len(vai))
        save_fold(stage, protocol, config, name, k, rm, ma, r2, len(tri), len(vai))
    ev = ~np.isnan(oof); rm, ma, r2 = metrics(y_all[ev], oof[ev])
    save(stage, protocol, config, name, int(np.mean(ntr_l)), int(ev.sum()), rm, ma, r2, float(np.std([p[0] for p in per])), time.time() - t0, note)
    if save_oof: np.save(OOF_DIR / f"{protocol}__{config}__{name.replace(' ', '_').replace('/', '_')}.npy", oof)
    log(f"[{stage}/{protocol}] {name:32s} RMSE {rm:.4f}  MAE {ma:.4f}  R2 {r2:.3f}  ({time.time()-t0:.0f}s)")

def holdout_eval(stage, name, factory, cols, config="holdout", train_cap=None):
    if done(stage, "random", config, name): return None
    t0 = time.time(); X = Xof(cols); tri = R_train if train_cap is None else sub(R_train, train_cap, np.random.default_rng(SEED))
    m = factory().fit(X.iloc[tri], y_all[tri]); p = m.predict(X.iloc[R_test]); rm, ma, r2 = metrics(y_all[R_test], p)
    save(stage, "random", config, name, len(tri), len(R_test), rm, ma, r2, None, time.time() - t0, "refit on all training rows" if train_cap is None else "capped")
    log(f"[{stage}/holdout] {name:32s} RMSE {rm:.4f}  MAE {ma:.4f}  R2 {r2:.3f}  ({time.time()-t0:.0f}s)")
    return p

# ================================================================== stages
def stage_import():
    """Bring in results already computed earlier (spatial protocol) so both protocols sit in one DB."""
    def csv(n): p = OUT / n; return pd.read_csv(p) if p.exists() else None
    t = csv("tournament_cv.csv")
    if t is not None:
        for _, r in t.iterrows():
            if done("benchmark", "spatial", "F29", r["model"]): continue
            save("benchmark", "spatial", "F29", r["model"], None, None, r["RMSE"], r["MAE"], None, float(np.std([r.get(f"fold{k}_RMSE") for k in (0, 1, 2, 4)])),
                 None, "4-strip spatial CV (earlier tournament)", {"worst_fold": r["worst_fold_RMSE"], "plains": r["RMSE_plains"], "foothill": r["RMSE_foothill"]}, "imported:tournament_cv.csv")
    fz = csv("frozen_strip_results.csv")
    if fz is not None:
        for _, r in fz.iterrows():
            save("final", "spatial", "frozen", r["model"], None, int(r["n"]), r["RMSE"], r["MAE"], None, None, None, "frozen strip 3, scored once",
                 {"bias": r["Bias"], "plains": r["RMSE_plains"], "foothill": r["RMSE_foothill"]}, "imported:frozen_strip_results.csv")
    fv = csv("frozen_strip_voting_experiment.csv")
    if fv is not None:
        for _, r in fv.iterrows():
            save("final", "spatial", "frozen-extra", r["model"], None, int(r["n"]), r["RMSE"], r["MAE"], None, None, None, "extra frozen-strip run", {"bias": r["Bias"]}, "imported:frozen_strip_voting_experiment.csv")
    fs = csv("featsel_cv.csv")
    if fs is not None:
        for _, r in fs.iterrows():
            save("featsel", "spatial", f"k={int(r['k'])}", r["method"], None, None, r["RMSE"], r["MAE"], None, None, None, "ranking inside each CV fold's training rows",
                 {"worst_fold": r["worst_fold"]}, "imported:featsel_cv.csv")
    fsets = csv("feature_sets.csv")
    if fsets is not None:
        for _, r in fsets.iterrows():
            save("config", "spatial", r["features"], r["algo"], None, None, r["RMSE"], r["MAE"], None, None, r.get("secs"), f"{int(r['n_features'])} features",
                 {"n_features": int(r["n_features"]), "foothill": r["RMSE_foothill"]}, "imported:feature_sets.csv")
    so = csv("split_optimism.csv")
    if so is not None: set_meta("split_optimism_earlier", json.loads(so.to_json(orient="records")))
    oof_p = ROOT / "model" / "saved" / "oof_predictions.parquet"
    if oof_p.exists():
        o = pd.read_parquet(oof_p).sample(3000, random_state=SEED)
        db.execute("INSERT OR REPLACE INTO samples VALUES (?,?,?,?)", ("spatial", "LightGBM (tuned, production)", "actual_vs_pred",
                   json.dumps({"y": o["elevation_error_signed"].round(3).tolist(), "p": o["oof_pred"].round(3).tolist()}))); db.commit()
    log("imported earlier spatial results")

def stage_config():
    """Phase 3-4: which input groups are used? (with radar / without radar / production set). Model: LightGBM (default). Random CV."""
    for cfg in ["F43_full", "F33_noradar", "F31_nodateproxy", "F29_parity_safe"]:
        if cfg in FS: cv_eval("config", "random", cfg, "LightGBM", MODELS["LightGBM (default)"][0], FS[cfg], note=f"{len(FS[cfg])} features", save_oof=False)
        for name, v in [("LightGBM", None)]:
            if done("config", "random", cfg, "LightGBM"):
                db.execute("UPDATE results SET extra=? WHERE stage='config' AND protocol='random' AND config=? AND model='LightGBM'", (json.dumps({"n_features": len(FS[cfg])}), cfg)); db.commit()

def stage_benchmark():
    only = [s.strip() for s in A.only.split(",") if s.strip()]
    for protocol in ["random", "spatial"]:
        for name, (mk, tcap, ecap, note) in MODELS.items():
            if only and name not in only: continue
            if protocol == "spatial" and done("benchmark", "spatial", "F29", name) and name in ("Ridge", "ElasticNet", "Extra Trees", "Random Forest", "Hist Gradient Boosting"): pass
            cv_eval("benchmark", protocol, "F29_run", name, mk, F29, tcap, ecap, note)

def stage_ensembles():
    """Voting = plain average; Stacking = non-negative weights learned leave-one-fold-out. Built from saved out-of-fold predictions."""
    comb = {"Voting: RF + Extra Trees + CatBoost": ["Random Forest", "Extra Trees", "CatBoost"],
            "Voting: Ridge + LightGBM + CatBoost": ["Ridge", "LightGBM (default)", "CatBoost"],
            "Voting: Ridge + LightGBM(tuned) + CatBoost": ["Ridge", "LightGBM (tuned, production)", "CatBoost"]}
    for protocol in ["random", "spatial"]:
        def get(n):
            p = OOF_DIR / f"{protocol}__F29_run__{n.replace(' ', '_')}.npy"; return np.load(p) if p.exists() else None
        for name, parts in comb.items():
            if done("ensembles", protocol, "F29_run", name): continue
            arr = [get(n) for n in parts]
            if any(a is None for a in arr): log(f"  skip {name} ({protocol}): base predictions missing"); continue
            p = np.mean(arr, axis=0); ev = ~np.isnan(p); rm, ma, r2 = metrics(y_all[ev], p[ev])
            save("ensembles", protocol, "F29_run", name, None, int(ev.sum()), rm, ma, r2, None, None, "average of out-of-fold predictions", {"technique": "Voting", "parts": parts})
            log(f"[ensembles/{protocol}] {name:44s} RMSE {rm:.4f}")
        for name, parts in {"Stacking (non-negative weights): RF + Extra Trees + CatBoost": comb["Voting: RF + Extra Trees + CatBoost"],
                            "Stacking (non-negative weights): Ridge + LightGBM + CatBoost": comb["Voting: Ridge + LightGBM + CatBoost"]}.items():
            if done("ensembles", protocol, "F29_run", name): continue
            arr = [get(n) for n in parts]
            if any(a is None for a in arr): continue
            P = np.column_stack(arr); ev = ~np.isnan(P).any(axis=1); out = np.full(len(df), np.nan)
            for k, (tr, va) in enumerate(PROTO[protocol]):
                trm = np.zeros(len(df), bool)
                for k2, (_, v2) in enumerate(PROTO[protocol]):
                    if k2 != k: trm[v2] = True
                trm &= ev; w, _ = nnls(np.column_stack([P[trm], np.ones(trm.sum())]), y_all[trm])
                out[va] = np.column_stack([P[va], np.ones(len(va))]) @ w
            e2 = ~np.isnan(out); rm, ma, r2 = metrics(y_all[e2], out[e2])
            save("ensembles", protocol, "F29_run", name, None, int(e2.sum()), rm, ma, r2, None, None, "weights learned leave-one-fold-out", {"technique": "Stacking", "parts": parts})
            log(f"[ensembles/{protocol}] {name:44s} RMSE {rm:.4f}")

def rank_features(method, idx, cols):
    r = np.random.default_rng(SEED).choice(idx, size=min(40_000, len(idx)), replace=False)
    Xr = Xof(cols).iloc[r]; med = Xr.median().fillna(0); Xf = Xr.fillna(med).values; yr = y_all[r]
    Z = (Xf - Xf.mean(0)) / (Xf.std(0) + 1e-9)
    if method == "Correlation": s = np.nan_to_num([abs(np.corrcoef(Z[:, j], yr)[0, 1]) for j in range(Z.shape[1])])
    elif method == "Mutual Information": s = mutual_info_regression(Z, yr, random_state=SEED)
    elif method == "F-test": s = np.nan_to_num(f_regression(Z, yr)[0])
    elif method == "Lasso": s = np.abs(LassoCV(cv=3, random_state=SEED, n_jobs=NJ).fit(Z, yr).coef_)
    elif method == "RFE (Ridge)": s = -RFE(Ridge(alpha=10), n_features_to_select=1, step=1).fit(Z, yr).ranking_.astype(float)
    else: s = RandomForestRegressor(n_estimators=100, max_depth=14, min_samples_leaf=5, max_features=0.5, n_jobs=NJ, random_state=SEED).fit(Z, yr).feature_importances_
    return [cols[i] for i in np.argsort(-s)]
def stage_featsel():
    methods = ["Correlation", "Mutual Information", "F-test", "Lasso", "RFE (Ridge)", "RF importance"]
    for method in methods:
        for k in (10, 15, 20, 25):
            cfg = f"k={k}"
            if done("featsel", "random", cfg, method): continue
            t0 = time.time(); errs = []; r = np.random.default_rng(SEED); per = []; stab = {}
            for tr, va in PROTO["random"]:
                rk = rank_features(method, tr, F29); cols = rk[:k]
                for c in cols: stab[c] = stab.get(c, 0) + 1
                tri = sub(tr, A.cv_train, r); m = MODELS["LightGBM (tuned, production)"][0]().fit(Xof(F29).iloc[tri][cols], y_all[tri])
                e = y_all[va] - m.predict(Xof(F29).iloc[va][cols]); errs.append(e); per.append(float(np.sqrt(np.mean(e ** 2))))
            e = np.concatenate(errs); save("featsel", "random", cfg, method, None, int(len(e)), float(np.sqrt(np.mean(e ** 2))), float(np.mean(np.abs(e))), None,
                                           float(np.std(per)), time.time() - t0, "ranking inside each CV fold's training rows", {"worst_fold": max(per), "stability": stab})
            log(f"[featsel/random] {method:20s} k={k:2d} RMSE {np.sqrt(np.mean(e**2)):.4f}")
    cv_eval("featsel", "random", "k=29", "All 29 features (baseline)", MODELS["LightGBM (tuned, production)"][0], F29, save_oof=False)

def stage_tuning():
    """Phase 10: Grid vs Random vs Optuna, identical budget & objective (3-fold random CV on a 120k subsample of the training rows)."""
    import optuna; optuna.logging.set_verbosity(optuna.logging.WARNING)
    r = np.random.default_rng(SEED); tune_idx = r.choice(R_train, min(120_000, len(R_train)), replace=False)
    kf = list(KFold(3, shuffle=True, random_state=SEED).split(tune_idx)); X = Xof(F29)
    def obj(p):
        se = 0.0; n = 0
        for a, b in kf:
            m = LGBMRegressor(**p, subsample_freq=1, random_state=SEED, verbose=-1, n_jobs=NJ).fit(X.iloc[tune_idx[a]], y_all[tune_idx[a]])
            e = y_all[tune_idx[b]] - m.predict(X.iloc[tune_idx[b]]); se += float(np.sum(e ** 2)); n += len(e)
        return float(np.sqrt(se / n))
    space = dict(n_estimators=[150, 300, 500], num_leaves=[15, 31, 63, 127], learning_rate=[0.03, 0.06, 0.1], min_child_samples=[20, 100, 300])
    base = dict(n_estimators=200, num_leaves=63, learning_rate=0.05, min_child_samples=20, colsample_bytree=0.8, subsample=0.8)
    import itertools
    def run(name, fn):
        if done("tuning", "random", "LightGBM", name): return
        t0 = time.time(); best, bp, n = fn(); save("tuning", "random", "LightGBM", name, len(tune_idx), None, best, None, None, None, time.time() - t0, f"{n} trials, 3-fold CV", {"best_params": bp, "trials": n})
        log(f"[tuning] {name:20s} best CV RMSE {best:.4f}  ({time.time()-t0:.0f}s)")
    def grid():
        keys = list(space); combos = list(itertools.product(*[space[k] for k in keys])); pick = [combos[i] for i in np.random.default_rng(SEED).permutation(len(combos))[:A.trials]]
        res = [(obj({**base, **dict(zip(keys, c))}), dict(zip(keys, c))) for c in pick]; b = min(res, key=lambda t: t[0]); return b[0], b[1], len(res)
    def rand():
        rr = np.random.default_rng(SEED + 1); res = []
        for _ in range(A.trials):
            p = dict(n_estimators=int(rr.integers(150, 501)), num_leaves=int(rr.integers(15, 128)), learning_rate=float(np.exp(rr.uniform(np.log(0.02), np.log(0.12)))), min_child_samples=int(rr.integers(20, 401)))
            res.append((obj({**base, **p}), p))
        b = min(res, key=lambda t: t[0]); return b[0], b[1], len(res)
    def opt():
        def f(t): return obj({**base, **dict(n_estimators=t.suggest_int("n_estimators", 150, 500), num_leaves=t.suggest_int("num_leaves", 15, 127),
                           learning_rate=t.suggest_float("learning_rate", 0.02, 0.12, log=True), min_child_samples=t.suggest_int("min_child_samples", 20, 400))})
        s = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=SEED)); s.optimize(f, n_trials=A.trials); return s.best_value, s.best_params, A.trials
    run("Grid search (sampled grid)", grid); run("Randomized search", rand); run("Optuna (TPE)", opt)
    if not done("tuning", "random", "LightGBM", "Default LightGBM (no tuning)"):
        v = obj(base); save("tuning", "random", "LightGBM", "Default LightGBM (no tuning)", len(tune_idx), None, v, None, None, None, 0, "same objective", {"best_params": base})

def stage_final():
    """Phase 11-12: held-out 20% random test. Best CV models + baselines are refit on ALL training rows."""
    rows = pd.read_sql("SELECT model, rmse FROM results WHERE stage='benchmark' AND protocol='random' AND config='F29_run' ORDER BY rmse", db)
    top = [m for m in rows["model"] if m not in ("KNN", "SVR")][:4]
    names = list(dict.fromkeys(["Dummy Mean", "Ridge"] + top + ["LightGBM (tuned, production)"]))
    preds = {}
    for n in names:
        p = holdout_eval("final", n, MODELS[n][0], F29, "holdout")
        if p is None:
            continue
        preds[n] = p
    if "LightGBM (tuned, production)" in preds:
        p = preds["LightGBM (tuned, production)"]; yt = y_all[R_test]; e = yt - p
        raw = float(np.sqrt(np.mean(yt ** 2))); cor = float(np.sqrt(np.mean(e ** 2)))
        const = float(np.sqrt(np.mean((yt - y_all[R_train].mean()) ** 2)))
        set_meta("random_holdout_correction", {"raw_rmse": raw, "raw_mae": float(np.mean(np.abs(yt))), "constant_bias_rmse": const, "corrected_rmse": cor, "corrected_mae": float(np.mean(np.abs(e))),
                 "rmse_reduction_pct": 100 * (1 - cor / raw), "mean_residual": float(e.mean()), "residual_sd": float(e.std()), "max_abs_error": float(np.max(np.abs(e))), "n_test": int(len(yt))})
        s = np.random.default_rng(SEED).choice(len(yt), min(3000, len(yt)), replace=False)
        db.execute("INSERT OR REPLACE INTO samples VALUES (?,?,?,?)", ("random", "LightGBM (tuned, production)", "actual_vs_pred", json.dumps({"y": yt[s].round(3).tolist(), "p": p[s].round(3).tolist()})))
        h, edges = np.histogram(np.clip(e, -15, 15), bins=40, range=(-15, 15))
        db.execute("INSERT OR REPLACE INTO samples VALUES (?,?,?,?)", ("random", "LightGBM (tuned, production)", "residual_hist", json.dumps({"counts": h.tolist(), "edges": edges.round(2).tolist()}))); db.commit()
    # voting on the holdout (cheap: base predictions already in memory)
    vt = [n for n in ("Random Forest", "Extra Trees", "CatBoost") if n in preds]
    if len(vt) == 3 and not done("final", "random", "holdout", "Voting: RF + Extra Trees + CatBoost"):
        p = np.mean([preds[n] for n in vt], axis=0); rm, ma, r2 = metrics(y_all[R_test], p)
        save("final", "random", "holdout", "Voting: RF + Extra Trees + CatBoost", len(R_train), len(R_test), rm, ma, r2, None, None, "average of three refit models"); log("[final] voting holdout", round(rm, 4))

def stage_decision():
    """Pre-declared check: does ANY model beat our production model by >=1% pooled RMSE under the SPATIAL protocol?"""
    # apples-to-apples: only results computed in THIS run (same rows, same 300k-per-fold design), spatial protocol
    q = pd.read_sql("SELECT stage, model, rmse FROM results WHERE protocol='spatial' AND stage IN ('benchmark','ensembles') AND config='F29_run' AND source='computed'", db)
    prod = q[q.model == "LightGBM (tuned, production)"]["rmse"].min()
    best = q.loc[q["rmse"].idxmin()]; margin = 100 * (1 - best["rmse"] / prod)
    qr = pd.read_sql("SELECT model, rmse FROM results WHERE protocol='random' AND stage IN ('benchmark','ensembles') AND config='F29_run'", db)
    rbest = qr.loc[qr["rmse"].idxmin()] if len(qr) else None
    redo = bool(margin >= 1.0)
    d = {"rule": "Redo the pipeline only if some model beats the production model by >= 1% pooled RMSE under the SPATIAL protocol. Random-split rankings are reported but cannot trigger a redo (nearby points leak between train and test).",
         "production_spatial_rmse": float(prod), "best_spatial_model": best["model"], "best_spatial_rmse": float(best["rmse"]), "best_spatial_margin_pct": float(margin),
         "best_random_model": None if rbest is None else rbest["model"], "best_random_rmse": None if rbest is None else float(rbest["rmse"]), "redo_pipeline": redo, "n_rows_used": int(keep.sum()), "valid_for_decision": bool(keep.sum() >= 500_000), "computed_utc": now()}
    set_meta("decision", d); log("decision:", json.dumps(d, indent=1))

FN = {"import": stage_import, "config": stage_config, "benchmark": stage_benchmark, "ensembles": stage_ensembles, "featsel": stage_featsel,
      "tuning": stage_tuning, "final": stage_final, "decision": stage_decision}
t_all = time.time()
for s in run_stages:
    log("=== stage:", s); FN[s]()
set_meta("last_run_utc", now()); log("ALL DONE in", int(time.time() - t_all), "s ->", A.db)
