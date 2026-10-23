"""GET /api/sdg/outlook/rain and /api/sdg/outlook/rain/method: the rainfall-driven outlook built by etl/forecast/build_rain_model.py (patch 12). Read-only.
When rainfall did not help on years the model had not seen, rows is empty and the method answer says so. Nothing is invented."""
import json
import math
from pathlib import Path
import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter()
DIR = Path(__file__).resolve().parent.parent / "data" / "processed" / "sdg" / "forecast"


def _clean(v):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return v


@router.get("/outlook/rain/method")
def rain_method():
    p = DIR / "rain_model_backtest.json"
    if not p.exists():
        raise HTTPException(404, "Rainfall model not built yet. Run: uv run python etl/forecast/build_rain_features.py, then etl/forecast/build_rain_model.py")
    return json.loads(p.read_text(encoding="utf-8"))


@router.get("/outlook/rain")
def rain_outlook(country: str = "IND", bound: str = "upper_union", target: str = "people", limit: int = 15):
    if country not in ("IND", "NPL"):
        raise HTTPException(400, "country must be IND or NPL")
    if bound not in ("lower_unflagged", "upper_union"):
        raise HTTPException(400, "bound must be lower_unflagged or upper_union")
    if target not in ("people", "cropland_ha"):
        raise HTTPException(400, "target must be people or cropland_ha")
    if not 1 <= limit <= 200:
        raise HTTPException(400, "limit must be 1 to 200")
    p = DIR / "outlook_rain_by_district.csv"
    if not p.exists():
        raise HTTPException(404, "Rainfall model not built yet. Run: uv run python etl/forecast/build_rain_features.py, then etl/forecast/build_rain_model.py")
    d = pd.read_csv(p)
    d = d[(d["iso"] == country) & (d["bound"] == bound) & (d["target"] == target)]
    rows = []
    for dist, g in d.groupby("district"):
        r = {"district": dist, "iso": country, "model": str(g["model"].iloc[0])}
        for _, x in g.iterrows():
            r[x["scenario"]] = {"p10": _clean(float(x["p10"])), "p50": _clean(float(x["p50"])), "p90": _clean(float(x["p90"]))}
        if all(k in r for k in ("dry", "typical", "wet")):
            rows.append(r)
    rows.sort(key=lambda r: -(r["wet"]["p90"] or 0))
    return {"country": country, "bound": bound, "target": target, "districts_total": len(rows), "rows": rows[:limit]}
