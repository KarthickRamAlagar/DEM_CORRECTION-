"""GET /api/sdg/outlook and /api/sdg/outlook/method: the district flood outlook built by etl/forecast/build_outlook.py. Read-only. If the files are missing the answer says so; nothing is invented."""
import json
import math
from pathlib import Path
import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter()
DIR = Path(__file__).resolve().parent.parent / "data" / "processed" / "sdg" / "forecast"
BOUNDS = {"lower_unflagged", "upper_union"}


def _clean(v):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return v


@router.get("/outlook/method")
def outlook_method():
    p = DIR / "backtest.json"
    if not p.exists():
        raise HTTPException(404, "Outlook not built yet. Run: uv run python etl/forecast/build_outlook.py")
    return json.loads(p.read_text(encoding="utf-8"))


@router.get("/outlook")
def outlook(country: str = "IND", bound: str = "upper_union", limit: int = 15):
    if country not in ("IND", "NPL"):
        raise HTTPException(400, "country must be IND or NPL")
    if bound not in BOUNDS:
        raise HTTPException(400, "bound must be lower_unflagged or upper_union")
    if not 1 <= limit <= 200:
        raise HTTPException(400, "limit must be 1 to 200")
    p = DIR / "outlook_by_district.csv"
    if not p.exists():
        raise HTTPException(404, "Outlook not built yet. Run: uv run python etl/forecast/build_outlook.py")
    d = pd.read_csv(p)
    d = d[(d["iso"] == country) & (d["bound"] == bound)].sort_values("people_p90", ascending=False)
    total = len(d)
    rows = [{k: _clean(v) for k, v in r.items()} for r in d.head(limit).to_dict("records")]
    return {"country": country, "bound": bound, "districts_total": total, "rows": rows}
