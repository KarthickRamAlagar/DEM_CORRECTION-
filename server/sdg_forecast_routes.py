"""GET /api/sdg/forecast/status and /api/sdg/forecast/point: the GloFAS river forecast for the river cell nearest to a chosen place (patch 13). Read-only.
Built by etl/forecast/build_glofas_forecast.py. Every date is given as ISO date + weekday + lead days, so the page can show day, date and year.
Nothing is invented: if the files are missing the answer says which step to run. A forecast of river flow is not a flood map and not a recovery-need decision."""
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import numpy as np
from fastapi import APIRouter, HTTPException

router = APIRouter()
ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "processed" / "sdg" / "forecast"
CFG = ROOT / "etl" / "forecast" / "forecast_config.json"
_cache = {}


def _cfg():
    return json.loads(CFG.read_text(encoding="utf-8"))


def _load():
    p = DIR / "glofas_forecast_latest.npz"
    if not p.exists():
        raise HTTPException(404, "River forecast not built yet. Run: uv run python etl/forecast/fetch_glofas.py --forecast, then build_glofas_features.py (needs --history first) and build_glofas_forecast.py")
    key = p.stat().st_mtime
    if _cache.get("k") != key:
        z = np.load(p); _cache.update(k=key, z={k: z[k] for k in z.files}, meta=json.loads((DIR / "glofas_forecast_meta.json").read_text(encoding="utf-8")))
    return _cache["z"], _cache["meta"]


def _f(v):
    v = float(v)
    return None if math.isnan(v) or math.isinf(v) else v


def _day(d: date):
    return {"date": d.isoformat(), "weekday": d.strftime("%A"), "year": d.year}


@router.get("/forecast/status")
def forecast_status():
    c = _cfg(); mp = DIR / "glofas_forecast_meta.json"; lp = DIR / "glofas_levels_meta.json"; rp = DIR / "river_model_backtest.json"
    out = {"forecast_built": mp.exists(), "levels_built": lp.exists(), "tiers": c["tiers"], "status": c["status"], "today_server": date.today().isoformat()}
    if mp.exists():
        m = json.loads(mp.read_text(encoding="utf-8")); iss = date.fromisoformat(m["issue_date"]); out.update(issue=_day(iss), members=m["members"], age_days=(date.today() - iss).days, lead_days=m["lead_days"], date_rule=m["date_rule"])
    if rp.exists():
        r = json.loads(rp.read_text(encoding="utf-8")); out["river_added_value_beyond_rain"] = r.get("river_added_value")
    return out


@router.get("/forecast/point")
def forecast_point(lat: float, lon: float):
    if not (20 <= lat <= 35 and 75 <= lon <= 92):
        raise HTTPException(400, "lat/lon outside the study area")
    z, meta = _load(); c = _cfg(); la, lo = z["lat"], z["lon"]; river = z["river"]
    kx = 111.0 * math.cos(math.radians(lat))
    ii, jj = np.where(river)
    if len(ii) == 0:
        raise HTTPException(404, "No river cells in the forecast file.")
    dist = np.hypot((la[ii] - lat) * 111.0, (lo[jj] - lon) * kx); rad = c["river_cell_search_km"]
    near = int(dist.argmin()); within = np.where(dist <= rad)[0]
    # the river that matters for a flood is the biggest one nearby, not the closest stream: take the highest mean flow within the search radius
    if len(within):
        mf = z["mean"][ii[within], jj[within]]; big = within[mf >= 0.8 * np.nanmax(mf)]      # among the biggest rivers (within 20% of the largest flow), take the closest
        k = int(big[np.argmin(dist[big])])
    else: k = near
    i, j = int(ii[k]), int(jj[k]); dkm = float(dist[k])
    iss = date.fromisoformat(meta["issue_date"]); lead = z["lead_days"]
    base = {"issue": _day(iss), "members": meta["members"], "date_rule": meta["date_rule"], "status": c["status"],
            "river_cell": {"lat": _f(la[i]), "lon": _f(lo[j]), "distance_km": round(dkm, 1), "mean_flow_m3s": _f(z["mean"][i, j]), "small_river": bool(z["mean"][i, j] < c.get("small_river_mean_m3s", 200)), "rule": f"closest of the largest rivers (within 20% of the highest mean flow) inside {rad} km",
                           "river_cells_within_radius": int(len(within)), "nearest_river_km": round(float(dist[near]), 1)}}
    if not len(within):
        return {**base, "found": False, "reason": f"No large river cell within {rad} km of this place, so there is no river forecast to show. The nearest is {dist[near]:.0f} km away."}
    series = []
    for n, d in enumerate(lead):
        dd = iss + timedelta(days=int(d))
        series.append({**_day(dd), "lead_days": int(d), "q_p10": _f(z["q10"][n, i, j]), "q_p50": _f(z["q50"][n, i, j]), "q_p90": _f(z["q90"][n, i, j]),
                       "p_rl2": _f(z["p_rl2"][n, i, j]), "p_rl5": _f(z["p_rl5"][n, i, j]), "p_rl20": _f(z["p_rl20"][n, i, j])})
    exp_t, pos_t = c["alert"]["expected_at_or_above"], c["alert"]["possible_at_or_above"]
    tiers, level, top = {}, "not_indicated", None
    for key in ("rl2", "rl5", "rl20"):
        pm = _f(z[f"pmax_{key}"][i, j]); first_exp = next((s for s in series if (s[f"p_{key}"] or 0) >= exp_t), None); first_pos = next((s for s in series if (s[f"p_{key}"] or 0) >= pos_t), None)
        peak = max(series, key=lambda s: s[f"p_{key}"] or 0) if series else None
        tiers[key] = {"label": c["tiers"][key]["label"], "flow_m3s": _f(z[key][i, j]), "assumed_river_rise_m": c["tiers"][key]["assumed_river_rise_m"], "chance_any_day": pm,
                      "first_expected": None if not first_exp else {k: first_exp[k] for k in ("date", "weekday", "year", "lead_days")}, "first_possible": None if not first_pos else {k: first_pos[k] for k in ("date", "weekday", "year", "lead_days")},
                      "most_likely_day": None if not peak or not (peak[f"p_{key}"] or 0) > 0 else {k: peak[k] for k in ("date", "weekday", "year", "lead_days")}, "most_likely_day_chance": None if not peak else peak[f"p_{key}"]}
        if pm is not None and pm >= exp_t: level, top = "expected", key
        elif pm is not None and pm >= pos_t and level != "expected": level, top = "possible", key
    peak_q = max(series, key=lambda s: s["q_p50"] or 0) if series else None
    # day to run the flow for: the day the highest tier that is expected (or possible) is first reached
    focus = None
    if top:
        t = tiers[top]; fd = t["first_expected"] or t["first_possible"] or t["most_likely_day"]
        if fd: focus = {**fd, "tier": top, "assumed_river_rise_m": t["assumed_river_rise_m"]}
    return {**base, "found": True, "alert": {"level": level, "tier": top, "label": tiers[top]["label"] if top else None}, "focus": focus, "tiers": tiers, "series": series,
            "peak_median_flow": None if not peak_q else {**{k: peak_q[k] for k in ("date", "weekday", "year", "lead_days")}, "m3s": peak_q["q_p50"]},
            "caveats": ["River flow is a GloFAS model at about 5 km, not a gauge. A flow above a flood level does not by itself mean this place floods.",
                        "The river rise used for the what-if is a planning assumption (see status), not a measured water level.",
                        "The river in this forecast may not be the same river as the nearest mapped river used for the terrain what-if.",
                        "Flood levels come from the river model's own 2005-2025 history. The forecast can run higher or lower than that history.",
                        "The corrected elevation model is not claimed to improve this forecast."]}
