"""Rainfall-driven flood outlook per district (patch 12, step 2), with a leave-one-year-out backtest.
Run from the repo root (after build_rain_features.py):  uv run python -I -u etl/forecast/build_rain_model.py
Reads   data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv   (the same SDG table as patch 10)
        data/processed/sdg/forecast/rain_features_district_year.csv         (from build_rain_features.py)
Writes  data/processed/sdg/forecast/rain_model_backtest.json  and  outlook_rain_by_district.csv

Question asked: does knowing how wet a season was make the district's flood exposure easier to predict than the plain history of that district?
Test: leave one year out. Train on six years, predict the seventh, for each of the seven years (2019-2025). Same test for every model.
Models:  history (the district's other years)  |  rain_linear (quantile regression on district level + rain anomalies)  |  rain_gbm (small gradient boosting, quantile loss).
Rule:   a rainfall model is used only if its total pinball loss is lower than the plain history AND it is better in at least 5 of the 7 test years.
        If not, the answer is written plainly: rainfall did not help on years the model had not seen, and no rainfall-based numbers are produced.
The scenarios (dry / typical / wet) are NOT forecasts: they are "if this season's rain is like the drier / middle / wetter third of the seasons seen in 2019-2025"."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import QuantileRegressor

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; SDG = ROOT / "data" / "processed" / "sdg"; OUT = SDG / "forecast"
EXP = SDG / "exposure_ext" / "exposure_by_district_year_ext.csv"; FEAT = OUT / "rain_features_district_year.csv"
YEARS = list(range(2019, 2026)); QS = (0.1, 0.5, 0.9); COVER_MIN = 0.99; MIN_YEARS_BETTER = 5
TARGETS = {"people": "pop_exposed", "cropland_ha": "cropland_ha_exposed"}
RAIN = ["season_sum_mm", "max10_mm", "julaug_sum_mm"]       # driver columns of the features file; each becomes a relative anomaly a_<name>
# Model specs: (name, kind, columns). Patch 13 reuses this file for the river-flow model by changing FEAT, RAIN, SPECS and the output names.
LIN = ["dm", "a_season_sum_mm", "a_max10_mm"]; GBM = ["dm", "a_season_sum_mm", "a_max10_mm", "a_julaug_sum_mm", "logpop"]
SPECS = [("history", "history", None), ("rain_linear", "linear", LIN), ("rain_gbm", "gbm", GBM)]
OUT_JSON, OUT_CSV = "rain_model_backtest.json", "outlook_rain_by_district.csv"
DRIVER = "rainfall"            # wording in messages; the river-flow run sets "rainfall or river-flow"

def wquant(v, q): return float(np.quantile(np.asarray(v, float), q))
def pinball(y, preds): return float(np.mean([max(q * (y - p), (q - 1) * (y - p)) for q, p in zip(QS, preds)]))

def loo_mean(df, col):                  # mean of the OTHER years of the same district (train rows never see themselves)
    g = df.groupby("key")[col]; return (g.transform("sum") - df[col]) / (g.transform("count") - 1)

def build_X(train, test):
    """features for train rows (leave-one-out inside train) and for test rows (mean of all train years)"""
    tr, te = train.copy(), test.copy()
    tr["dm"] = loo_mean(tr, "z"); m = tr.groupby("key")["z"].mean(); te["dm"] = te["key"].map(m)
    for c in RAIN:
        tr[f"a_{c}"] = tr[c] / loo_mean(tr, c) - 1; mm = tr.groupby("key")[c].mean(); te[f"a_{c}"] = te[c] / te["key"].map(mm) - 1
    return tr, te

def fit_predict(name, tr, te):
    spec = {n: (k, c) for n, k, c in SPECS}[name]
    if spec[0] == "history":
        out = []
        for _, r in te.iterrows():
            v = tr.loc[tr["key"] == r["key"], "y"].values; out.append(sorted(wquant(v, q) for q in QS))
        return np.array(out)
    cols = spec[1]; preds = []
    for q in QS:
        if spec[0] == "linear": m = QuantileRegressor(quantile=q, alpha=0.0, solver="highs")
        else: m = HistGradientBoostingRegressor(loss="quantile", quantile=q, max_depth=3, learning_rate=0.05, max_iter=120, min_samples_leaf=15, random_state=0)
        m.fit(tr[cols].values, tr["z"].values); preds.append(m.predict(te[cols].values))
    p = np.sort(np.expm1(np.array(preds).T), axis=1); return np.maximum(p, 0.0)

def load(bound, tcol):
    e = pd.read_csv(EXP); e["year"] = e["year"].astype(str); e = e[e["year"].isin([str(y) for y in YEARS]) & (e["gfm_coverage"] >= COVER_MIN) & (e["bound"] == bound)].copy(); e["year"] = e["year"].astype(int)
    f = pd.read_csv(FEAT); d = e.merge(f[["iso", "district", "year"] + RAIN], on=["iso", "district", "year"], how="inner").dropna(subset=RAIN)
    d["key"] = d["iso"] + "|" + d["district"]; ok = d.groupby("key")["year"].transform("nunique") == len(YEARS); d = d[ok].copy()
    d["y"] = d[tcol].astype(float); d["z"] = np.log1p(d["y"]); d["logpop"] = np.log1p(d["district_pop"].astype(float)); return d.sort_values(["key", "year"]).reset_index(drop=True)

def main():
    for p in (EXP, FEAT):
        if not p.exists(): sys.exit(f"STOP: {p} not found. Run build_rain_features.py first (and the SDG tables).")
    summary, rows_out, folds_all = {}, [], []
    for tname, tcol in TARGETS.items():
        for bound in ("lower_unflagged", "upper_union"):
            d = load(bound, tcol)
            if d["key"].nunique() < 20: print(f"[{tname}/{bound}] only {d['key'].nunique()} districts with 7 years of rain and exposure: skipped"); continue
            res = []
            for t in YEARS:
                tr, te = build_X(d[d["year"] != t], d[d["year"] == t])
                for name, _, _ in SPECS:
                    p = fit_predict(name, tr, te)
                    for (_, r), pr in zip(te.iterrows(), p): res.append({"key": r["key"], "year": t, "model": name, "actual": r["y"], "p10": pr[0], "p50": pr[1], "p90": pr[2], "pinball": pinball(r["y"], pr), "ae": abs(r["y"] - pr[1])})
            bt = pd.DataFrame(res); models = {}
            for name, g in bt.groupby("model"):
                models[name] = {"pinball_total": float(g["pinball"].sum()), "mae_median": float(g["ae"].mean()), "coverage_10_90": float(((g["actual"] >= g["p10"]) & (g["actual"] <= g["p90"])).mean()), "pinball_by_year": {int(y): float(v) for y, v in g.groupby("year")["pinball"].sum().items()}}
            ref = models["history"]
            for name, m in models.items():
                m["skill_vs_history"] = float(1 - m["pinball_total"] / ref["pinball_total"]) if ref["pinball_total"] > 0 else None
                m["years_better_than_history"] = None if name == "history" else int(sum(m["pinball_by_year"][y] < ref["pinball_by_year"][y] for y in YEARS))
            chosen, why = "history", f"no {DRIVER} model beat the plain history in at least {MIN_YEARS_BETTER} of {len(YEARS)} test years"
            for name in [n for n, _, _ in SPECS if n != "history"]:
                m = models[name]
                if m["skill_vs_history"] and m["skill_vs_history"] > 0 and m["years_better_than_history"] >= MIN_YEARS_BETTER and (chosen == "history" or m["skill_vs_history"] > models[chosen]["skill_vs_history"]):
                    chosen, why = name, f"{name} beat the plain history in {m['years_better_than_history']} of {len(YEARS)} test years"
            # does a wetter season go with more exposure than the district's own usual? (pooled, descriptive)
            tr_all, _ = build_X(d, d.iloc[:0]); resid = tr_all["z"] - tr_all["dm"]
            rho = spearmanr(tr_all["a_season_sum_mm"], resid, nan_policy="omit")[0]
            summary[f"{tname}|{bound}"] = {"target": tname, "bound": bound, "districts": int(d["key"].nunique()), "models": models, "chosen": chosen, "reason": why, "spearman_season_rain_vs_exposure_change": None if rho is None or np.isnan(rho) else float(rho)}
            print(f"\n[{tname} / {bound}] {d['key'].nunique()} districts. Chosen: {chosen} ({why}). Spearman(wetter season, exposure above the district's usual) = {rho:+.3f}")
            for name, m in models.items(): print(f"   {name:12s} pinball {m['pinball_total']:>14,.0f}  skill {m['skill_vs_history']:+.3f}  years better {m['years_better_than_history']}  10-90 coverage {m['coverage_10_90']:.2f}")
            if chosen == "history": continue
            # widening factor so the 10-90 range holds about 80% of the test values (fitted on the backtest of the chosen model)
            g = bt[bt["model"] == chosen]; k = 6.0
            for kk in np.arange(1.0, 6.01, 0.1):
                lo = np.maximum(0, g["p50"] - kk * (g["p50"] - g["p10"])); hi = g["p50"] + kk * (g["p90"] - g["p50"])
                if ((g["actual"] >= lo) & (g["actual"] <= hi)).mean() >= 0.8: k = float(round(kk, 1)); break
            summary[f"{tname}|{bound}"]["widen_k"] = k
            # scenarios: set the rain anomalies to the 20th / 50th / 80th percentile of the district's own 7 seasons
            tr, _ = build_X(d, d.iloc[:0]); last = d.groupby("key").tail(1).copy(); mm = d.groupby("key")["z"].mean(); last["dm"] = last["key"].map(mm)
            for c in RAIN:
                mc = d.groupby("key")[c].mean(); rel = (d[c] / d["key"].map(mc) - 1); d[f"rel_{c}"] = rel
            for scen, qq in (("dry", 0.2), ("typical", 0.5), ("wet", 0.8)):
                sc = last.copy()
                for c in RAIN: sc[f"a_{c}"] = sc["key"].map(d.groupby("key")[f"rel_{c}"].quantile(qq))
                p = fit_predict(chosen, tr, sc)
                for (_, r), pr in zip(sc.iterrows(), p):
                    lo_, mid_, hi_ = max(0.0, pr[1] - k * (pr[1] - pr[0])), pr[1], pr[1] + k * (pr[2] - pr[1]); iso, dist = r["key"].split("|", 1)
                    rows_out.append({"iso": iso, "district": dist, "bound": bound, "target": tname, "scenario": scen, "model": chosen, "p10": lo_, "p50": mid_, "p90": hi_})
    OUT.mkdir(parents=True, exist_ok=True)
    cols = ["iso", "district", "bound", "target", "scenario", "model", "p10", "p50", "p90"]
    pd.DataFrame(rows_out, columns=cols).to_csv(OUT / OUT_CSV, index=False)
    any_used = any(s["chosen"] != "history" for s in summary.values())
    meta = {"built_utc": pd.Timestamp.now("UTC").isoformat(timespec="seconds"), "years": YEARS, "test_design": "leave one year out (train on six years, predict the seventh), repeated for each year",
            "rule": f"A rainfall model is used only if it has lower total pinball loss than the plain history AND is better in at least {MIN_YEARS_BETTER} of {len(YEARS)} test years.", "rainfall_helped": any_used, "summary": summary,
            "scenario_meaning": "dry / typical / wet = the 20th / 50th / 80th percentile of the district's own season rain anomalies in 2019-2025. A what-if on rain, not a rainfall forecast.",
            "limits": ["Seven seasons only. A wet or dry scenario is read from at most seven seasons per district.", "Rainfall is the CHIRPS district mean. It does not capture upstream rain in Nepal or a river forecast.", "Exposure comes from the satellite flood record; unflagged scenes give a lower bound, flagged scenes an upper bound.",
                       "Leave-one-year-out uses later years to predict earlier ones. That is fine to test whether rain explains exposure, but it is not a test of predicting the future from the past (patch 10 does that)."]}
    (OUT / OUT_JSON).write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"\nA driver model helped on unseen years: {any_used}.  Wrote {OUT_JSON} and {OUT_CSV} ({len(rows_out)} rows).")

if __name__ == "__main__":
    main()
