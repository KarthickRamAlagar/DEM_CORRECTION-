"""
Builds model/saved/eval_summary.json from the recorded evaluation outputs (no re-training, no invented numbers).
Run from repo root:  uv run python model/evaluation/make_eval_summary.py
Sources: outputs/*.csv|json|log, model/saved/registry.json, model/saved/oof_predictions.parquet
"""
import json, re
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs"
SAVED = ROOT / "model" / "saved"

def rec(df): return json.loads(df.to_json(orient="records"))

reg = json.loads((SAVED / "registry.json").read_text(encoding="utf-8"))
cv = pd.read_csv(OUT / "tournament_cv.csv")
frozen = pd.read_csv(OUT / "frozen_strip_results.csv")
fsets = pd.read_csv(OUT / "feature_sets.csv")
conf = json.loads((OUT / "conformal_check.json").read_text())
shap_g = json.loads((OUT / "shap_global_importance.json").read_text())

# per-group frozen-strip coverage from the log
groups = []
for m in re.finditer(r"group (\d+) \(region (\d+), tri tercile (\d+)\): q90=([\d.]+) n_frozen=(\d+) coverage=([\d.]+)",
                     (OUT / "frozen.log").read_text(encoding="utf-8", errors="ignore")):
    g, r, t, q, n, c = m.groups()
    groups.append({"group": int(g), "terrain": "Plains" if r == "0" else "Foothill",
                   "roughness_tercile": ["Smooth", "Moderate", "Rough"][int(t)],
                   "q90_m": float(q), "n": int(n), "coverage": float(c)})

# pooled out-of-fold error on all 1.22M points (each predicted by a model that never saw its strip+buffer)
oof = pd.read_parquet(SAVED / "oof_predictions.parquet")
err_raw = oof["elevation_error_signed"].to_numpy()
err_cor = err_raw - oof["oof_pred"].to_numpy()
oof_stats = {"n": int(len(oof)),
             "raw_rmse": float(np.sqrt(np.mean(err_raw ** 2))), "corrected_rmse": float(np.sqrt(np.mean(err_cor ** 2))),
             "raw_mae": float(np.mean(np.abs(err_raw))), "corrected_mae": float(np.mean(np.abs(err_cor)))}
# histogram of absolute error, raw vs corrected
bins = [0, 1, 2, 3, 5, 10, 1e9]; labels = ["<1 m", "1-2 m", "2-3 m", "3-5 m", "5-10 m", ">10 m"]
def hist(e): return (np.histogram(np.abs(e), bins=bins)[0] / len(e)).round(4).tolist()
oof_stats["abs_error_bins"] = {"labels": labels, "raw": hist(err_raw), "corrected": hist(err_cor)}

cv_pct = cv.copy()
best = float(cv["RMSE"].min())
cv_pct["within_1pct_of_best"] = cv["RMSE"] <= best * 1.01

summary = {
    "model_version": reg["model_version"], "created_utc": reg["created_utc"], "algorithm": reg["algorithm"],
    "target": reg["target"], "validation_design": reg["validation"]["design"], "known_limits": reg.get("known_limits", []),
    "selection_rule": (OUT / "selection_rule.md").read_text(encoding="utf-8"),
    "winner": "LightGBM_L2_tuned",
    "cv_table": rec(cv_pct), "frozen_table": rec(frozen), "feature_set_table": rec(fsets),
    "interval": {"nominal": 0.90, "frozen_coverage": conf["frozen_coverage"], "q90_by_group": conf["q90"], "groups": groups},
    "oof": oof_stats, "shap_global": shap_g,
    "note": "CV models used a 300k-row subsample per fold; frozen-strip numbers come from one single scoring on a strip never used for fitting/tuning/selection.",
}
(SAVED / "eval_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
print("wrote", SAVED / "eval_summary.json", "| oof raw/corr RMSE:", round(oof_stats["raw_rmse"], 4), round(oof_stats["corrected_rmse"], 4))
