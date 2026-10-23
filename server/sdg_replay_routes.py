"""GET /api/sdg/forecast/replay/status and /api/sdg/forecast/replay: what the GloFAS river model had the river doing on a PAST day (June to October, 2005-2025). Patch 13c. Read-only.
This is a replay from the river model's own history (reanalysis), not a forecast and not a gauge reading. It lets the SDG flow be run for a day that has already happened.
Uses data/external/glofas/historical/*.nc and glofas_levels.npz. Nothing is invented: a missing file or day gives a plain message."""
import math
import sys
from datetime import date, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from .sdg_forecast_routes import _cfg, _day, _f

router = APIRouter()
ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / "data" / "external" / "glofas" / "historical"
LEVELS = ROOT / "data" / "processed" / "sdg" / "forecast" / "glofas_levels.npz"
_years, _lv = {}, {}


def _levels():
    if not LEVELS.exists():
        raise HTTPException(404, "River flood levels not built yet. Run: uv run python etl/forecast/build_glofas_features.py")
    if _lv.get("k") != LEVELS.stat().st_mtime:
        z = np.load(LEVELS); _lv.update(k=LEVELS.stat().st_mtime, z={k: z[k] for k in z.files})
    return _lv["z"]


def _year(y):
    f = HIST / f"glofas_hist_{y}.nc"
    if not f.exists():
        avail = sorted(int(p.stem.split("_")[-1]) for p in HIST.glob("glofas_hist_*.nc")) if HIST.exists() else []
        raise HTTPException(404, f"No river history for {y}. Years available: {avail[0]}-{avail[-1]}." if avail else "No river history downloaded yet. Run: uv run python etl/forecast/fetch_glofas.py --history")
    if y not in _years:
        sys.path.insert(0, str(ROOT / "etl" / "forecast"))
        import glofas_io as G
        dates, la, lo, a = G.read_history(f)
        if len(_years) >= 4: _years.pop(next(iter(_years)))
        _years[y] = (dates, la, lo, a.astype("float32"))
    return _years[y]


@router.get("/forecast/replay/status")
def replay_status():
    ys = sorted(int(p.stem.split("_")[-1]) for p in HIST.glob("glofas_hist_*.nc")) if HIST.exists() else []
    return {"available": bool(ys), "years": ys, "from": f"{ys[0]}-06-02" if ys else None, "to": f"{ys[-1]}-10-31" if ys else None, "months": "June to October only",
            "note": "A replay of the river model's own history (GloFAS reanalysis). Not a forecast and not a gauge reading."}


@router.get("/forecast/replay")
def replay(lat: float, lon: float, day: str):
    if not (20 <= lat <= 35 and 75 <= lon <= 92):
        raise HTTPException(400, "lat/lon outside the study area")
    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "day must be YYYY-MM-DD")
    c = _cfg(); L = _levels(); dates, la, lo, arr = _year(d.year)
    if len(L["lat"]) != len(la) or len(L["lon"]) != len(lo) or not (np.allclose(L["lat"], la) and np.allclose(L["lon"], lo)):
        raise HTTPException(500, "The river history and the flood levels are on different grids. Rebuild with build_glofas_features.py.")
    river = L["river"]; ii, jj = np.where(river)
    if len(ii) == 0: raise HTTPException(404, "No river cells.")
    kx = 111.0 * math.cos(math.radians(lat)); dist = np.hypot((L["lat"][ii] - lat) * 111.0, (L["lon"][jj] - lon) * kx); rad = c["river_cell_search_km"]
    near = int(dist.argmin()); within = np.where(dist <= rad)[0]
    if not len(within):
        return {"found": False, "mode": "replay", "reason": f"No large river cell within {rad} km of this place, so there is no river replay to show. The nearest is {dist[near]:.0f} km away."}
    mf = L["mean"][ii[within], jj[within]]; big = within[mf >= 0.8 * np.nanmax(mf)]; k = int(big[np.argmin(dist[big])]); i, j = int(ii[k]), int(jj[k])
    ts = pd.Timestamp(d); idx = np.where(dates == ts)[0]
    if not len(idx):
        raise HTTPException(404, f"No river data for {d.isoformat()}. The {d.year} file covers {dates.min():%Y-%m-%d} to {dates.max():%Y-%m-%d} (June to October).")
    t = int(idx[0]); flow = _f(arr[t, i, j]); lv = {key: _f(L[key][i, j]) for key in ("rl2", "rl5", "rl20")}
    reached = [key for key in ("rl2", "rl5", "rl20") if flow is not None and lv[key] is not None and flow >= lv[key]]; top = reached[-1] if reached else None
    series = [{**_day((ts + timedelta(days=o)).date()), "q": _f(arr[t + o, i, j])} for o in range(-10, 11) if 0 <= t + o < len(dates)]
    return {"found": True, "mode": "replay", "date": _day(d), "flow_m3s": flow, "levels_m3s": lv, "tier": top, "tier_label": c["tiers"][top]["label"] if top else None, "assumed_river_rise_m": c["tiers"][top]["assumed_river_rise_m"] if top else None,
            "times_rl2": None if not flow or not lv["rl2"] else round(flow / lv["rl2"], 2), "series": series, "status": c["status"],
            "river_cell": {"lat": _f(L["lat"][i]), "lon": _f(L["lon"][j]), "distance_km": round(float(dist[k]), 1), "mean_flow_m3s": _f(L["mean"][i, j]), "small_river": bool(L["mean"][i, j] < c.get("small_river_mean_m3s", 200)), "river_cells_within_radius": int(len(within))},
            "date_rule": "The date is the day the 24-hour flow window ends (UTC).",
            "caveats": ["A replay of the river model's own history (GloFAS reanalysis), not a forecast and not a gauge reading.", "A flow above a flood level does not by itself mean this place flooded that day.", "The river rise used for the what-if is a planning assumption, not a measured water level.", "The river in this replay may not be the same river as the nearest mapped river used for the terrain what-if."]}
