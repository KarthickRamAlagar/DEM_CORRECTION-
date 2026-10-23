"""GET /api/sdg/outlook/point?lat=&lon= (patch 11, with the river-height values added in 11c): "will this place flood in a typical coming year?" Patch 11. Read-only.
Also returns the height above the nearest river at this cell from the raw and the corrected DEM (2022 rasters), and which river rises cover the cell under each.
Two sources, both statistics on the 2019-2026 satellite flood record (no weather or river forecast):
  1. this ~90 m cell: in how many of the 8 years did the satellite see flooding (lower and upper bound), turned into a chance with a range (Jeffreys prior);
  2. this district: the outlook built by etl/forecast/build_outlook.py (patch 10), both bounds.
The verdict is a band, not a yes/no. Nothing is guessed: a missing file or district gives null and a message."""
import math
import pandas as pd
from fastapi import APIRouter, HTTPException

from . import sdg_chain_routes as C

router = APIRouter()
OUTLOOK = C.SDG / "forecast" / "outlook_by_district.csv"
HAND_BOX = C.HAND_BOX
RULE = "Likely: even the conservative satellite count gives a chance of 50% or more. Unlikely: even the upper count gives under 20%. Otherwise: possible."


def _chance(k, n):
    mean = (k + 0.5) / (n + 1)
    try:
        from scipy.stats import beta
        b = beta(k + 0.5, n - k + 0.5)
        return float(b.ppf(0.1)), float(mean), float(b.ppf(0.9))
    except Exception:
        return None, float(mean), None


def _clean(v):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return v


@router.get("/outlook/point")
def outlook_point(lat: float, lon: float):
    w_, s_, e_, n_ = HAND_BOX
    if not (w_ <= lon <= e_ and s_ <= lat <= n_):
        raise HTTPException(400, "This place is outside the study layer (81.9-84.0 E, 25.4-28.0 N).")
    files = [C.EXT / "years_flooded_lower.tif", C.EXT / "years_flooded_upper.tif", C.BASE / "district_id.tif"]
    for p in files:
        if not p.exists():
            raise HTTPException(503, f"Missing data file: {p.name}. Run the etl/sdg steps first.")
    c3, r3 = int(math.floor((lon - C.W0) / C.PX)), int(math.floor((C.N0 - lat) / C.PX))
    yl = int(C._read(files[0], c3, r3, 1, 1)[0, 0])
    yu = int(C._read(files[1], c3, r3, 1, 1)[0, 0])
    did = int(C._read(files[2], c3, r3, 1, 1)[0, 0])
    t = C._did_table()[0]
    here = {"name": str(t.loc[did, "shapeName"]), "iso": str(t.loc[did, "iso"])} if did > 0 and did in t.index else None
    col, row = int(math.floor((lon - w_) * 3600)), int(math.floor((n_ - lat) * 3600))

    def hv(k):
        if not C.HAND[k].exists():
            return None
        v = float(C._read(C.HAND[k], col, row, 1, 1)[0, 0])
        return v if (v > -9990 and math.isfinite(v)) else None
    h_raw, h_cor = hv("raw"), hv("corrected")
    hand = {"raw": h_raw, "corrected": h_cor,
            "by_rise": [{"rise": r, "raw_flooded": (None if h_raw is None else h_raw <= r), "corrected_flooded": (None if h_cor is None else h_cor <= r)} for r in C.RISES]}
    n = 8
    lo = _chance(yl, n)
    hi = _chance(yu, n)
    cell = {"years_lower": yl, "years_upper": yu, "of": n, "chance_low": lo[0], "chance_mid_lower": lo[1], "chance_mid_upper": hi[1], "chance_high": hi[2]}
    if lo[1] >= 0.5:
        level, text = "likely", "Flooding is likely in a typical year at this spot."
    elif hi[1] < 0.2:
        level, text = "unlikely", "Flooding is unlikely in a typical year at this spot, but not impossible."
    else:
        level, text = "possible", "Flooding is possible in a typical year at this spot."
    out = {"label": "Statistical outlook from the 2019-2026 satellite record. Not a flood warning and not a forecast for a named day.",
           "point": {"lat": lat, "lon": lon}, "here": here, "cell": cell, "hand": hand, "verdict": {"level": level, "text": text, "rule": RULE},
           "district": None, "outlook_built": OUTLOOK.exists(),
           "notes": ["The 8 years are 2019 to 2026; 2026 is not a finished year.", "A forecast for one named day or season needs a rainfall or river forecast, which is not built yet."]}
    if here and OUTLOOK.exists():
        d = pd.read_csv(OUTLOOK)
        d = d[(d["iso"] == here["iso"]) & (d["district"].astype(str).str.strip().str.lower() == here["name"].strip().lower())]
        if len(d):
            out["district"] = {"name": here["name"], "iso": here["iso"], "bounds": {r["bound"]: {k: _clean(v) for k, v in r.items()} for r in d.to_dict("records")}}
    return out
