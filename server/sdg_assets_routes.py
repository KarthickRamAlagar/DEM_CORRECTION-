"""GET /api/sdg/chain/assets (patch 22, D2 and D3): main roads, bridges, schools, health facilities and shelters in the flooded part of the circle.
Same what-if as /chain/scenario: a place counts as flooded when its height above the nearest mapped river (HAND, 2022 DEM, raw or corrected) is at or below the river rise.
Tables come from etl/sdg/osm_assets.py (OpenStreetMap, volunteer-mapped, incomplete: every count is a minimum). Read-only. A missing table gives available=false and a message, never zeros.
Bridges: a bridge is 'approach under water' when either end of it sits on land under water. Roads: only motorway to tertiary were downloaded."""
import json
import math
from functools import lru_cache

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from . import sdg_chain_routes as C

router = APIRouter()
DIR = C.SDG / "assets"
KM_DEG = C.KM_DEG
KINDS = ("school", "health", "shelter")
NOTES = ["OpenStreetMap is mapped by volunteers and is incomplete, especially for small schools, clinics and village roads in India and Nepal. Every count here is a minimum.",
         "Only main roads (motorway, trunk, primary, secondary, tertiary) were downloaded. Village roads are not counted.",
         "Under water = height above the nearest mapped river is at or below the river rise you chose. No flow physics, no embankments, no road drainage. A what-if, not a forecast.",
         "A place with no river-height value (no mapped river within about 12 km) is counted as 'no value', never as flooded or dry.",
         "A bridge is counted when either end sits on land under water: its approach is cut, not necessarily the bridge itself."]


@lru_cache(maxsize=1)
def _tables():
    if not (DIR / "road_samples.csv").exists():
        return None
    R = pd.read_csv(DIR / "road_samples.csv")
    P = pd.read_csv(DIR / "points.csv", keep_default_na=False, na_values=[""]) if (DIR / "points.csv").exists() else pd.DataFrame(columns=["osm_id", "kind", "amenity", "name", "lat", "lon", "hand_raw", "hand_corrected"])
    B = pd.read_csv(DIR / "bridges.csv", keep_default_na=False, na_values=[""]) if (DIR / "bridges.csv").exists() else pd.DataFrame()
    P["name"] = P["name"].fillna("").astype(str)
    meta = json.loads((DIR / "meta.json").read_text(encoding="utf-8")) if (DIR / "meta.json").exists() else {}
    return R, P, B, meta


def _inside(df, lat, lon, radius_km, latc="lat", lonc="lon"):
    dlat = radius_km / KM_DEG
    dlon = radius_km / (KM_DEG * math.cos(math.radians(lat)))
    df = df[(df[latc] >= lat - dlat) & (df[latc] <= lat + dlat) & (df[lonc] >= lon - dlon) & (df[lonc] <= lon + dlon)]
    dy = (df[latc] - lat) * KM_DEG
    dx = (df[lonc] - lon) * KM_DEG * math.cos(math.radians(lat))
    return df[(dx * dx + dy * dy) <= radius_km ** 2]


def _under(series, rise):
    return series.notna() & (series <= rise)


def _one(k, R, P, B, rise):
    col = "hand_corrected" if k == "corrected" else "hand_raw"
    out = {"roads": None, "bridges": None}
    if len(R):
        main = R[R.cls.isin(C_MAIN)]
        has = main[main[col].notna()]
        fl = main[_under(main[col], rise)]
        by = (fl.groupby("cls").seg_m.sum() / 1000.0)
        out["roads"] = {"km_total": float(main.seg_m.sum() / 1000.0), "km_with_river_height": float(has.seg_m.sum() / 1000.0),
                        "km_under_water": float(fl.seg_m.sum() / 1000.0), "km_under_water_by_class": {c: float(by.get(c, 0.0)) for c in sorted(C_MAIN)}}
    if len(B):
        ha, hb = f"hand_a_{k}", f"hand_b_{k}"
        known = B[B[ha].notna() | B[hb].notna()]
        cut = known[_under(known[ha], rise) | _under(known[hb], rise)]
        out["bridges"] = {"total": int(len(B)), "with_river_height": int(len(known)), "approach_under_water": int(len(cut)),
                          "names": [n for n in cut["name"].astype(str) if n][:8]}
    else:
        out["bridges"] = {"total": 0, "with_river_height": 0, "approach_under_water": 0, "names": []}
    for kind in KINDS:
        s = P[P.kind == kind] if len(P) else P
        known = s[s[col].notna()] if len(s) else s
        fl = known[known[col] <= rise] if len(known) else known
        named = [str(n) for n in fl["name"] if str(n)] if len(fl) else []
        out[kind] = {"total": int(len(s)), "with_river_height": int(len(known)), "under_water": int(len(fl)), "no_value": int(len(s) - len(known)),
                     "unnamed_under_water": int(len(fl) - len(named)), "names": named[:8]}
    return out


C_MAIN = {"motorway", "trunk", "primary", "secondary", "tertiary"}


@router.get("/chain/assets")
def assets(lat: float, lon: float, radius_km: float = 10.0, rise_m: float = 2.0):
    if not (0.5 <= radius_km <= 25):
        raise HTTPException(400, "radius_km must be between 0.5 and 25")
    if not (0.25 <= rise_m <= 15):
        raise HTTPException(400, "rise_m must be between 0.25 and 15")
    w_, s_, e_, n_ = C.HAND_BOX
    if not (w_ <= lon <= e_ and s_ <= lat <= n_):
        raise HTTPException(400, "This place is outside the river-height layer (81.9-84.0 E, 25.4-28.0 N).")
    t = _tables()
    base = {"label": "Roads, bridges, schools and health facilities in the flooded part of the circle. A what-if from terrain height, not a forecast. OpenStreetMap counts are minimums.",
            "point": {"lat": lat, "lon": lon}, "radius_km": radius_km, "rise_m": rise_m, "notes": NOTES}
    if t is None:
        return {**base, "available": False, "message": "Road and facility tables are not built yet. Run: uv run python -I etl/sdg/osm_assets.py"}
    R, P, B, meta = t
    R = _inside(R, lat, lon, radius_km)
    P = _inside(P, lat, lon, radius_km) if len(P) else P
    B = _inside(B, lat, lon, radius_km) if len(B) else B
    sc = {k: _one(k, R, P, B, rise_m) for k in ("corrected", "raw")}
    listing = []
    if len(P):
        col = "hand_corrected"
        fl = P[_under(P[col], rise_m)].sort_values(col)
        for r in fl.head(40).itertuples():
            listing.append({"kind": r.kind, "name": r.name or None, "amenity": r.amenity, "lat": float(r.lat), "lon": float(r.lon), "height_above_river_m": float(getattr(r, col))})
    # Coverage check (patch 22c): in the OSM download, Nepal's schools are mapped densely and India's thinly, while health facilities are mapped about evenly.
    # If the circle has clearly fewer mapped schools than health facilities, the school count is a very low minimum and must not be compared across places.
    ns = int((P["kind"] == "school").sum()) if len(P) else 0
    nh = int((P["kind"] == "health").sum()) if len(P) else 0
    cov = {"schools_mapped": ns, "health_mapped": nh, "schools_thin": bool(nh >= 3 and ns < nh)}
    return {**base, "available": True, "built": meta.get("built"), "scenario": sc, "under_water_list": listing, "coverage": cov}
