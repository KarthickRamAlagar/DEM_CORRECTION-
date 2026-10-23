"""Does river flow add skill beyond rainfall? (patch 13, step 2). Same leave-one-year-out test and same rule as the rainfall model (patch 12).
Run from the repo root (after build_rain_features.py and build_glofas_features.py):  uv run python -I -u etl/forecast/build_river_model.py
Years: only 2019-2025 (the years with satellite flood data). The river model is shown only if it beats the plain history on years it had not seen.
Writes data/processed/sdg/forecast/river_model_backtest.json and outlook_river_by_district.csv, and says whether the river flow beat the rainfall-only model."""
import importlib.util, json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("brm", HERE / "build_rain_model.py"); brm = importlib.util.module_from_spec(spec); spec.loader.exec_module(brm)
brm.FEAT = brm.OUT / "river_features_district_year.csv"
brm.RAIN = ["season_sum_mm", "max10_mm", "julaug_sum_mm", "q_peak_ratio", "q_mean_ratio"]
brm.SPECS = [("history", "history", None),
             ("rain_gbm", "gbm", ["dm", "a_season_sum_mm", "a_max10_mm", "a_julaug_sum_mm", "logpop"]),
             ("river_linear", "linear", ["dm", "a_q_peak_ratio", "a_q_mean_ratio"]),
             ("river_gbm", "gbm", ["dm", "a_season_sum_mm", "a_max10_mm", "a_q_peak_ratio", "a_q_mean_ratio", "logpop"])]
brm.OUT_JSON, brm.OUT_CSV = "river_model_backtest.json", "outlook_river_by_district.csv"
brm.DRIVER = "rainfall or river-flow"
if not brm.FEAT.exists(): sys.exit(f"STOP: {brm.FEAT} not found. Run build_rain_features.py and build_glofas_features.py first.")
brm.main()
p = brm.OUT / brm.OUT_JSON
if p.exists():
    meta = json.loads(p.read_text(encoding="utf-8")); added = {}
    for k, s in meta["summary"].items():
        m = s["models"]; rain = m.get("rain_gbm"); best = min((m[n] for n in ("river_linear", "river_gbm") if n in m), key=lambda x: x["pinball_total"])
        added[k] = bool(rain and best["pinball_total"] < rain["pinball_total"] and s["chosen"].startswith("river"))
        print(f"  {k}: river flow beat the rainfall-only model: {added[k]}")
    meta["river_beat_rain_only"] = added; meta["river_added_value"] = any(added.values())
    meta["note"] = "river_added_value is true only if a river model was chosen over the plain history AND had a lower total pinball loss than the rainfall-only model on the same unseen years."
    p.write_text(json.dumps(meta, indent=1), encoding="utf-8"); print("River flow added value beyond rainfall:", meta["river_added_value"])
