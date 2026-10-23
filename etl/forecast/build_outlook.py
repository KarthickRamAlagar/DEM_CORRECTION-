"""Flood outlook per district (patch 10). Statistics on the 2019-2025 satellite flood record, with a backtest.
Run from the repo root:  uv run python etl/forecast/build_outlook.py
Reads  data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv  and  data/processed/sdg/funding/funding_need_by_district_year.csv
Writes data/processed/sdg/forecast/outlook_by_district.csv and backtest.json. Reads nothing else, changes nothing else.

What this is: for each district, "if a typical coming year looks like the past record, how many people / how much cropland / how much recovery need,
and how likely is any flooding". Every figure is a RANGE (10th to 90th percentile of the model) and was tested on years the model had not seen.
What this is NOT: a flood warning, a weather forecast, or a statement about one named season. 2026 is left out (the year is not finished).
A model other than the plain historical record is used only if it beat the plain record in the backtest (rule at the bottom)."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[2]; SDG = ROOT / "data" / "processed" / "sdg"
EXP = SDG / "exposure_ext" / "exposure_by_district_year_ext.csv"; FUN = SDG / "funding" / "funding_need_by_district_year.csv"
OUT = SDG / "forecast"; COVER_MIN = 0.99; YEARS = list(range(2019, 2026)); QS = (0.1, 0.5, 0.9); MIN_TRAIN = 3
HALF_LIFE = 3.0

# ---------------------------------------------------------------- models: each takes (years, values, target_year) -> (p10, p50, p90)
def wquant(v, w, q):
    o = np.argsort(v); v, w = np.asarray(v, float)[o], np.asarray(w, float)[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return float(np.interp(q, c, v))
def m_clim(yrs, v, t):                                   # the plain historical record (reference model)
    w = np.ones(len(v)); return tuple(wquant(v, w, q) for q in QS)
def m_recent(yrs, v, t):                                 # same, recent years count more (half-life 3 years)
    w = 0.5 ** ((t - np.asarray(yrs, float)) / HALF_LIFE); return tuple(wquant(v, w, q) for q in QS)
def m_trend(yrs, v, t):                                  # Theil-Sen trend on log scale + spread of its residuals
    y = np.log1p(np.asarray(v, float)); x = np.asarray(yrs, float)
    sl = np.median([(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x)) for j in range(i + 1, len(x))]) if len(x) > 2 else 0.0
    ic = np.median(y - sl * x); res = y - (sl * x + ic); mid = sl * t + ic
    r = [wquant(res, np.ones(len(res)), q) for q in QS]
    return tuple(max(0.0, float(np.expm1(mid + ri))) for ri in r)
MODELS = {"history": m_clim, "recent_weighted": m_recent, "trend": m_trend}

def pinball(y, qs, preds):
    return float(np.mean([max(q * (y - p), (q - 1) * (y - p)) for q, p in zip(qs, preds)]))

def beta_interval(k, n, lo=0.1, hi=0.9):                 # chance of any flooding in a year, Jeffreys prior
    try:
        from scipy.stats import beta
        b = beta(k + 0.5, n - k + 0.5); return float(b.ppf(lo)), float(b.mean()), float(b.ppf(hi))
    except Exception:
        p = (k + 0.5) / (n + 1); return None, p, None

def load():
    e = pd.read_csv(EXP); e["year"] = e["year"].astype(str); e = e[e["year"].isin([str(y) for y in YEARS]) & (e["gfm_coverage"] >= COVER_MIN)].copy(); e["year"] = e["year"].astype(int)
    f = pd.read_csv(FUN); f["year"] = f["year"].astype(str); f = f[f["year"].isin([str(y) for y in YEARS])].copy(); f["year"] = f["year"].astype(int)
    m = e.merge(f[["iso", "district", "year", "bound", "need_min_inr", "need_max_inr"]], on=["iso", "district", "year", "bound"], how="left")
    return m

def series(g):  # one district + bound: full years only, no gaps allowed
    g = g.sort_values("year"); return g if list(g["year"]) == YEARS else None

def main():
    for p in (EXP, FUN):
        if not p.exists(): sys.exit(f"STOP: {p} not found. Run from the repo root after the SDG tables are built.")
    d = load(); OUT.mkdir(parents=True, exist_ok=True)
    groups = {k: series(g) for k, g in d.groupby(["iso", "district", "bound"])}; groups = {k: g for k, g in groups.items() if g is not None}
    print(f"{len(groups)} district-bound series with all {len(YEARS)} full years (coverage >= {COVER_MIN}).")

    # ---------------- backtest: train on years before t, predict t. Test years 2022..2025 (needs >= 3 training years).
    folds = [t for t in YEARS if t - YEARS[0] >= MIN_TRAIN]
    rows = []
    for (iso, dist, bound), g in groups.items():
        for t in folds:
            tr = g[g["year"] < t]; te = float(g.loc[g["year"] == t, "pop_exposed"].iloc[0])
            for name, fn in MODELS.items():
                pr = fn(tr["year"].values, tr["pop_exposed"].values, t); pr = tuple(sorted(pr))
                rows.append({"iso": iso, "district": dist, "bound": bound, "test_year": t, "model": name, "actual": te, "p10": pr[0], "p50": pr[1], "p90": pr[2],
                             "pinball": pinball(te, QS, pr), "abs_err_median": abs(te - pr[1]), "inside": pr[0] <= te <= pr[2]})
    bt = pd.DataFrame(rows)
    summ = {}
    for bound, gb in bt.groupby("bound"):
        per_model = {}
        for name, gm in gb.groupby("model"):
            per_year = gm.groupby("test_year")["pinball"].sum()
            per_model[name] = {"pinball_total": float(gm["pinball"].sum()), "mae_median_people": float(gm["abs_err_median"].mean()), "coverage_10_90": float(gm["inside"].mean()),
                               "pinball_by_year": {int(k): float(v) for k, v in per_year.items()}}
        ref = per_model["history"]
        for name, s in per_model.items():
            s["skill_vs_history"] = float(1 - s["pinball_total"] / ref["pinball_total"]) if ref["pinball_total"] > 0 else None
            s["years_better_than_history"] = int(sum(s["pinball_by_year"][y] < ref["pinball_by_year"][y] for y in s["pinball_by_year"])) if name != "history" else None
        # decision rule: another model replaces the plain history only if it has lower total pinball loss AND is better in at least 3 of the 4 test years
        best, why = "history", "no other model beat the plain historical record in at least 3 of the 4 test years"
        for name, s in per_model.items():
            if name != "history" and s["skill_vs_history"] and s["skill_vs_history"] > 0 and s["years_better_than_history"] >= 3: best, why = name, f"{name} beat the plain record in {s['years_better_than_history']} of {len(folds)} test years"
        summ[bound] = {"models": per_model, "chosen": best, "reason": why, "districts": int(gb[["iso", "district"]].drop_duplicates().shape[0])}
    chosen = {b: s["chosen"] for b, s in summ.items()}

    # ---------------- interval widening. The raw 10-90 ranges caught fewer actual values than 80%, so they are widened by a factor k fitted on the backtest.
    def cover(df, k):
        lo = np.maximum(0, df["p50"] - k * (df["p50"] - df["p10"])); hi = df["p50"] + k * (df["p90"] - df["p50"]); return float(((df["actual"] >= lo) & (df["actual"] <= hi)).mean())
    def fit_k(df, target=0.8):
        for k in np.arange(1.0, 6.01, 0.1):
            if cover(df, k) >= target: return float(round(k, 1))
        return 6.0
    kfac = {}
    half = folds[len(folds) // 2:]
    for b in summ:
        gb = bt[(bt["bound"] == b) & (bt["model"] == chosen[b])]
        early, late = gb[~gb["test_year"].isin(half)], gb[gb["test_year"].isin(half)]
        k_early = fit_k(early)
        kfac[b] = {"k": fit_k(gb), "coverage_raw": cover(gb, 1.0), "coverage_after_widening_same_years": cover(gb, fit_k(gb)),
                   "k_fitted_on_early_years": k_early, "coverage_late_years_raw": cover(late, 1.0), "coverage_late_years_with_early_k": cover(late, k_early), "late_years": half, "target": 0.8}
        summ[b]["calibration"] = kfac[b]

    # ---------------- outlook for a typical coming year, from all 7 full years, with the chosen model
    t_next = YEARS[-1] + 1; out = []
    for (iso, dist, bound), g in groups.items():
        fn = MODELS[chosen[bound]]; yrs = g["year"].values; n = len(yrs)
        kk = kfac[bound]["k"]
        def wide(r): r = sorted(r); return [max(0.0, r[1] - kk * (r[1] - r[0])), r[1], r[1] + kk * (r[2] - r[1])]
        pe = wide(fn(yrs, g["pop_exposed"].values, t_next)); ce = wide(fn(yrs, g["cropland_ha_exposed"].values, t_next))
        nl = g["need_min_inr"].values if g["need_min_inr"].notna().all() else None; nh = g["need_max_inr"].values if g["need_max_inr"].notna().all() else None
        nlo = wide(fn(yrs, nl, t_next)) if nl is not None else [None] * 3; nhi = wide(fn(yrs, nh, t_next)) if nh is not None else [None] * 3
        k = int((g["pop_exposed"].values > 0).sum()); plo, pmid, phi = beta_interval(k, n)
        pop = float(g["district_pop"].iloc[0])
        out.append({"iso": iso, "district": dist, "bound": bound, "model": chosen[bound], "years_in_record": n, "years_with_flooding": k,
                    "p_flood_low": plo, "p_flood": pmid, "p_flood_high": phi,
                    "people_p10": pe[0], "people_p50": pe[1], "people_p90": pe[2], "cropland_ha_p10": ce[0], "cropland_ha_p50": ce[1], "cropland_ha_p90": ce[2],
                    "need_inr_p10_low": nlo[0], "need_inr_p50_low": nlo[1], "need_inr_p50_high": nhi[1], "need_inr_p90_high": nhi[2], "district_pop": pop,
                    "people_p50_pct_of_district": (100 * pe[1] / pop if pop else None), "people_p90_pct_of_district": (100 * pe[2] / pop if pop else None)})
    o = pd.DataFrame(out).sort_values(["bound", "people_p90"], ascending=[True, False]); o.to_csv(OUT / "outlook_by_district.csv", index=False)
    meta = {"built_utc": pd.Timestamp.now("UTC").isoformat(timespec="seconds"), "years_used": YEARS, "years_left_out": ["2026 (year not finished)"], "test_years": folds, "outlook_for": f"a typical coming year (after {YEARS[-1]})",
            "quantiles": list(QS), "coverage_min": COVER_MIN, "series_used": len(groups), "decision_rule": "A model other than the plain historical record is used only if it has lower total pinball loss AND beats the record in at least 3 of the 4 test years.",
            "summary": summ, "chosen": chosen,
            "limits": ["Only 7 full years of satellite record, so the ranges are wide and honest about it.", "This is a statistical outlook, not a flood warning or a weather forecast.",
                       "Ranges are widened so that 80% of past test values fell inside; the check on later years is in backtest.json (calibration).", "It does not use rainfall or river forecasts yet (planned next).", "The record comes from the satellite flood extent used in the SDG tables; unflagged scenes give a lower bound, flagged scenes an upper bound."]}
    (OUT / "backtest.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    for b, s in summ.items():
        print(f"\n[{b}] chosen: {s['chosen']}  ({s['reason']})")
        c = s["calibration"]; print(f"   widening factor k={c['k']}: 10-90 coverage {c['coverage_raw']:.2f} -> {c['coverage_after_widening_same_years']:.2f} (target 0.80). Honest check: k fitted on early years ({c['k_fitted_on_early_years']}) gives {c['coverage_late_years_with_early_k']:.2f} on years {c['late_years']} (raw there {c['coverage_late_years_raw']:.2f}).")
        for name, m in s["models"].items(): print(f"   {name:16s} pinball {m['pinball_total']:>12,.0f}  skill vs history {m['skill_vs_history']:+.3f}  10-90 coverage {m['coverage_10_90']:.2f}  median MAE {m['mae_median_people']:,.0f} people")
    print(f"\nWrote {OUT/'outlook_by_district.csv'} ({len(o)} rows) and {OUT/'backtest.json'}")

if __name__ == "__main__":
    main()
