"""
sdg_chain_routes.py - place-based "impact chain" scenario + district map data (included by sdg_routes.py, so URLs are /api/sdg/...).

SCENARIO = "what if the river rises X m": land whose height above the nearest mapped river (HAND, raw or corrected DEM, 2022)
is at or below X m, inside a circle around a clicked point. It is a terrain-based what-if. It has NO flow physics (no discharge,
embankments, rainfall or time) and is NOT a forecast. It is shown next to flood extent actually observed by satellite 2019-2026.
Reads only rasters/tables already in data/processed/sdg. A missing value is returned as null ("No data"), never as 0.
"""
import base64
import json
import math
import os
import struct
import time
import zlib
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window
from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parent.parent
SDG = ROOT / "data/processed/sdg"
HAND = {"raw": SDG / "hand/hand_raw_2022.tif", "corrected": SDG / "hand/hand_corrected_2022.tif"}
BASE = SDG / "exposure_base_ext"
EXT = SDG / "exposure_ext"
GEOJSON = SDG / "districts_ext/districts_ext.geojson"
TABLE = BASE / "districts_table.csv"
CONFIG = ROOT / "etl/sdg/funding_config.json"

W0, N0 = 80.3, 29.0                 # extended grid origin (west, north), 3 arc-second cells
PX = 1 / 1200
HAND_BOX = (81.9, 25.4, 84.0, 28.0)  # west, south, east, north
KM_DEG = 111.195
NODATA = -9999.0
RISES = [0.5, 1, 2, 3, 4, 6, 8, 10]

router = APIRouter()


# ----------------------------------------------------------------- helpers
def _png(rgba):
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[i].tobytes() for i in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def _read(path, c0, r0, w, h):
    with rasterio.open(path) as s:
        return s.read(1, window=Window(c0, r0, w, h))


def _cfg():
    return json.load(open(CONFIG, encoding="utf-8"))


@lru_cache(maxsize=1)
def _did_table():
    t = pd.read_csv(TABLE)
    if t.did.duplicated().any():
        raise HTTPException(500, "districts_table.csv has duplicate did values")
    iso_of = np.zeros(int(t.did.max()) + 1, dtype=np.uint8)           # 0 none, 1 IND, 2 NPL
    iso_of[t.did.values] = np.where(t.iso.values == "IND", 1, 2)
    return t.set_index("did"), iso_of


def _money(iso, people, crop_ha, cfg):
    c = cfg[iso]
    hs, rc, cp, hf = c["household_size"], c["relief_cash_per_household"], c["crop_per_ha"], c["house_fully_damaged"]
    hh_lo, hh_hi = people / hs["high"], people / hs["low"]
    rc_lo, rc_hi = rc.get("low", rc.get("value")), rc.get("high", rc.get("value"))
    relief = (hh_lo * rc_lo, hh_hi * rc_hi)
    crop = (crop_ha * cp["low"], crop_ha * cp["high"]) if cp else (None, None)
    need = (relief[0] + (crop[0] or 0), relief[1] + (crop[1] or 0))
    housing = hh_hi * hf["value"]
    to_inr = 1.0 if iso == "IND" else 1.0 / cfg["inr_to_npr"]["value"]
    return {"iso": iso, "currency": c["currency"], "people": float(people), "cropland_ha": float(crop_ha),
            "households_min": float(hh_lo), "households_max": float(hh_hi),
            "relief_min": float(relief[0]), "relief_max": float(relief[1]),
            "crop_min": None if crop[0] is None else float(crop[0]), "crop_max": None if crop[1] is None else float(crop[1]),
            "need_min": float(need[0]), "need_max": float(need[1]), "housing_ceiling": float(housing),
            "need_min_inr": float(need[0] * to_inr), "need_max_inr": float(need[1] * to_inr), "housing_ceiling_inr": float(housing * to_inr),
            "status": {"household_size": hs["status"], "relief": rc["status"], "crop": (cp or {}).get("status", "No documented rate: not included")}}


# ----------------------------------------------------------------- scenario
@router.get("/chain/scenario")
def scenario(lat: float, lon: float, radius_km: float = 10.0, rise_m: float = 2.0):
    if not (0.5 <= radius_km <= 25):
        raise HTTPException(400, "radius_km must be between 0.5 and 25")
    if not (0.25 <= rise_m <= 15):
        raise HTTPException(400, "rise_m must be between 0.25 and 15")
    w_, s_, e_, n_ = HAND_BOX
    if not (w_ <= lon <= e_ and s_ <= lat <= n_):
        raise HTTPException(400, "This place is outside the river-height layer (81.9-84.0 E, 25.4-28.0 N). No chain numbers are given outside it.")
    for p in list(HAND.values()) + [BASE / "pop_2020.tif", BASE / "cropland_frac.tif", BASE / "district_id.tif", EXT / "years_flooded_upper.tif"]:
        if not p.exists():
            raise HTTPException(503, f"Missing data file: {p.name}. Run the etl/sdg steps first.")

    dlat = radius_km / KM_DEG
    dlon = radius_km / (KM_DEG * math.cos(math.radians(lat)))
    # 3 arc-second window covering the circle, clipped to the river-height box
    c_lo = max(math.floor((lon - dlon - W0) / PX), round((w_ - W0) / PX))
    c_hi = min(math.ceil((lon + dlon - W0) / PX), round((e_ - W0) / PX))
    r_lo = max(math.floor((N0 - (lat + dlat)) / PX), round((N0 - n_) / PX))
    r_hi = min(math.ceil((N0 - (lat - dlat)) / PX), round((N0 - s_) / PX))
    clipped = (lon - dlon < w_) or (lon + dlon > e_) or (lat - dlat < s_) or (lat + dlat > n_)
    w3, h3 = c_hi - c_lo, r_hi - r_lo
    if w3 <= 0 or h3 <= 0:
        raise HTTPException(400, "Empty window")

    # fine (1 arc-second) HAND window aligned to the 3 arc-second window
    hc0, hr0, wf, hf = (c_lo - round((w_ - W0) / PX)) * 3, (r_lo - round((N0 - n_) / PX)) * 3, w3 * 3, h3 * 3
    hand = {k: _read(p, hc0, hr0, wf, hf).astype("float32") for k, p in HAND.items()}
    if hand["raw"].shape != (hf, wf):
        raise HTTPException(500, "HAND window shape mismatch")

    pop = _read(BASE / "pop_2020.tif", c_lo, r_lo, w3, h3).astype("float64")
    pop_ok = pop > -9000
    pop = np.where(pop_ok, pop, 0.0)
    crop = _read(BASE / "cropland_frac.tif", c_lo, r_lo, w3, h3).astype("float64")
    built = _read(BASE / "builtup_frac.tif", c_lo, r_lo, w3, h3).astype("float64")
    bcount = _read(BASE / "bldg_count.tif", c_lo, r_lo, w3, h3).astype("float64")
    bok = _read(BASE / "bldg_ok.tif", c_lo, r_lo, w3, h3) > 0
    did = _read(BASE / "district_id.tif", c_lo, r_lo, w3, h3)
    yl = _read(EXT / "years_flooded_lower.tif", c_lo, r_lo, w3, h3)
    yu = _read(EXT / "years_flooded_upper.tif", c_lo, r_lo, w3, h3)

    # circle weight at 1 arc-second, then averaged to 3 arc-second cells
    lat_f = N0 - (r_lo * 3 + np.arange(hf) + 0.5) / 3600.0
    lon_f = W0 + (c_lo * 3 + np.arange(wf) + 0.5) / 3600.0
    dy = (lat_f - lat)[:, None] * KM_DEG
    dx = (lon_f - lon)[None, :] * KM_DEG * math.cos(math.radians(lat))
    inside_f = (dx * dx + dy * dy) <= radius_km ** 2
    blk = lambda a: a.reshape(h3, 3, w3, 3).mean(axis=(1, 3))
    wgt = blk(inside_f.astype("float64"))                                   # share of each 3" cell inside the circle
    lat_c = N0 - (r_lo + np.arange(h3) + 0.5) * PX
    cell_km2 = ((PX * KM_DEG) ** 2 * np.cos(np.radians(lat_c)))[:, None] * np.ones((1, w3))
    cell_ha = cell_km2 * 100.0

    valid = {k: (v > -9990) & np.isfinite(v) for k, v in hand.items()}
    iso_of = _did_table()[1]
    iso_cell = iso_of[np.clip(did, 0, len(iso_of) - 1)] * (did > 0)

    def flooded(k, rise):
        return blk(((hand[k] <= rise) & valid[k] & inside_f).astype("float64"))   # flooded fraction of each 3" cell (already inside the circle)

    def totals(frac):
        return {"flooded_km2": float((frac * cell_km2).sum()), "people": float((frac * pop).sum()),
                "cropland_ha": float((frac * crop * cell_ha).sum()), "builtup_ha": float((frac * built * cell_ha).sum()),
                "buildings": float((frac * bcount * bok).sum()) if bok[frac > 0].all() else None}

    sc, money, by_iso_dist = {}, {}, {}
    cfg = _cfg()
    for k in ("corrected", "raw"):
        fr = flooded(k, rise_m)
        sc[k] = totals(fr)
        mrows = []
        for code, iso in ((1, "IND"), (2, "NPL")):
            m = iso_cell == code
            p, ch = float((fr * pop)[m].sum()), float((fr * crop * cell_ha)[m].sum())
            if p > 0 or ch > 0:
                mrows.append(_money(iso, p, ch, cfg))
        money[k] = {"by_country": mrows, "need_min_inr": sum(r["need_min_inr"] for r in mrows) if mrows else None,
                    "need_max_inr": sum(r["need_max_inr"] for r in mrows) if mrows else None,
                    "housing_ceiling_inr": sum(r["housing_ceiling_inr"] for r in mrows) if mrows else None}
        if k == "corrected":
            by_iso_dist = fr
    curve = []
    for r in RISES:
        row = {"rise": r}
        for k in ("corrected", "raw"):
            t = totals(flooded(k, r))
            row[k] = {"flooded_km2": t["flooded_km2"], "people": t["people"]}
        curve.append(row)

    # observed floods in the same circle (2019-2026)
    obs = {}
    for name, y in (("lower", yl), ("upper", yu)):
        ever = (y > 0).astype("float64") * wgt
        obs[name] = {"flooded_km2": float((ever * cell_km2).sum()), "people": float((ever * pop).sum()), "cropland_ha": float((ever * crop * cell_ha).sum())}
    obs["max_years_upper"] = int(yu[wgt > 0].max()) if (wgt > 0).any() else 0

    circle = {"people": float((wgt * pop).sum()), "cropland_ha": float((wgt * crop * cell_ha).sum()), "area_km2": float((wgt * cell_km2).sum())}

    # districts touched by the corrected-DEM scenario
    t = _did_table()[0]
    dist = []
    ppl = by_iso_dist * pop
    for d in np.unique(did[(did > 0) & (ppl > 0)]):
        dist.append({"name": str(t.loc[d, "shapeName"]), "iso": str(t.loc[d, "iso"]), "people": float(ppl[did == d].sum())})
    dist = sorted(dist, key=lambda x: -x["people"])[:6]
    centre = did[min(h3 - 1, int((N0 - lat) / PX) - r_lo), min(w3 - 1, int((lon - W0) / PX) - c_lo)]
    here = {"name": str(t.loc[centre, "shapeName"]), "iso": str(t.loc[centre, "iso"])} if centre > 0 else None

    # overlay: both = blue, corrected only = violet, raw only = amber
    mc = (hand["corrected"] <= rise_m) & valid["corrected"] & inside_f
    mr = (hand["raw"] <= rise_m) & valid["raw"] & inside_f
    step = max(1, math.ceil(max(hf, wf) / 900))
    mc, mr = mc[::step, ::step], mr[::step, ::step]
    img = np.zeros(mc.shape + (4,), dtype=np.uint8)
    img[mc & mr] = (37, 99, 235, 175)
    img[mc & ~mr] = (139, 92, 246, 200)
    img[~mc & mr] = (245, 158, 11, 200)
    west, north = W0 + c_lo * PX, N0 - r_lo * PX
    overlay = {"png": base64.b64encode(_png(img)).decode(), "bounds": [[north - h3 * PX, west], [north, west + w3 * PX]]}

    return {
        "label": "What-if scenario from terrain height above the nearest river. Not a forecast. No flow physics. Not a release decision.",
        "point": {"lat": lat, "lon": lon}, "radius_km": radius_km, "rise_m": rise_m, "clipped_to_layer": bool(clipped), "here": here,
        "river_height_coverage": {k: float((valid[k] & inside_f).sum() / max(1, inside_f.sum())) for k in valid},
        "circle": circle, "scenario": sc, "curve": curve, "observed": obs, "districts": dist, "money": money, "overlay": overlay,
        "notes": ["River-height layer is built from the 2022 DEM. Cells farther than about 12 km from a mapped river have no river-height value and are never counted as flooded.",
                  "Raw and corrected DEM scenarios are shown side by side as a sensitivity check. Flood-extent skill was not measurably different between them.",
                  "Population is 2020 WorldPop (modelled). Cropland is WorldCover 2021 class 40.",
                  "Money = relief cash per household + crop input subsidy (India only). Housing is a separate ceiling. Estimated recovery need, not a release decision."],
    }


# ----------------------------------------------------------------- point check (uses the DEM engine's own result for one point)
def _status(lo, hi, rise):
    """Compare a height-above-river range with the water level. Never returns a single confident answer when the range straddles it."""
    if hi <= rise:
        return "flooded across the whole range"
    if lo > rise:
        return "dry across the whole range"
    return "uncertain: the range straddles the water level"


@router.get("/chain/point")
def point_check(lat: float, lon: float, raw_z: float, corrected_z: float, z_lo: float | None = None, z_hi: float | None = None, rise_m: float = 2.0):
    """One point, using the raw and corrected elevation (and the model's interval) from the DEM engine.
    Height above the nearest river at the point = HAND from the raw 2022 raster + (corrected_z - raw_z). This assumes the nearest river's own
    elevation does not change with the correction. It is an approximation, shown with the interval, never as one confident answer."""
    if not (0.25 <= rise_m <= 15):
        raise HTTPException(400, "rise_m must be between 0.25 and 15")
    for name, v in (("raw_z", raw_z), ("corrected_z", corrected_z)):
        if not (-100 <= v <= 9000):
            raise HTTPException(400, f"{name} is outside -100..9000 m")
    w_, s_, e_, n_ = HAND_BOX
    if not (w_ <= lon <= e_ and s_ <= lat <= n_):
        raise HTTPException(400, "This place is outside the river-height layer (81.9-84.0 E, 25.4-28.0 N).")
    for p in list(HAND.values()) + [BASE / "district_id.tif", EXT / "years_flooded_lower.tif", EXT / "years_flooded_upper.tif"]:
        if not p.exists():
            raise HTTPException(503, f"Missing data file: {p.name}. Run the etl/sdg steps first.")
    lo_z, hi_z = (z_lo, z_hi) if (z_lo is not None and z_hi is not None) else (None, None)
    if lo_z is not None and lo_z > hi_z:
        lo_z, hi_z = hi_z, lo_z

    col, row = int(math.floor((lon - w_) * 3600)), int(math.floor((n_ - lat) * 3600))
    def hv(k):
        v = float(_read(HAND[k], col, row, 1, 1)[0, 0])
        return v if (v > -9990 and math.isfinite(v)) else None
    h_raw, h_cor = hv("raw"), hv("corrected")
    c3, r3 = int(math.floor((lon - W0) / PX)), int(math.floor((N0 - lat) / PX))
    yl, yu = int(_read(EXT / "years_flooded_lower.tif", c3, r3, 1, 1)[0, 0]), int(_read(EXT / "years_flooded_upper.tif", c3, r3, 1, 1)[0, 0])
    did = int(_read(BASE / "district_id.tif", c3, r3, 1, 1)[0, 0])
    t = _did_table()[0]
    here = {"name": str(t.loc[did, "shapeName"]), "iso": str(t.loc[did, "iso"])} if did > 0 and did in t.index else None

    out = {"label": "Point check from the DEM engine result. A what-if from terrain height above the nearest river. Not a forecast.",
           "point": {"lat": lat, "lon": lon}, "here": here, "rise_m": rise_m,
           "elevation": {"raw": raw_z, "corrected": corrected_z, "shift": corrected_z - raw_z, "interval": None if lo_z is None else [lo_z, hi_z]},
           "hand": {"raw_raster": h_raw, "corrected_raster": h_cor},
           "adjusted": None, "by_rise": [], "observed_years": {"lower": yl, "upper": yu, "of": 8},
           "notes": ["Height above river 'adjusted' = raw river-height value at this point + (corrected - raw elevation). It assumes the river's own elevation is unchanged by the correction.",
                     "The model interval is the model's own range for the corrected elevation. When it straddles the water level the answer is 'uncertain', never a guess.",
                     "Observed years = years with satellite-seen flooding in this ~90 m cell, 2019-2026 (conservative to upper)."]}
    if h_raw is None:
        out["message"] = "No river-height value at this point (no mapped river within about 12 km, or no data). No flood status is given."
        return out
    d_mid = corrected_z - raw_z
    a_mid = h_raw + d_mid
    a_lo, a_hi = (h_raw + (lo_z - raw_z), h_raw + (hi_z - raw_z)) if lo_z is not None else (a_mid, a_mid)
    out["adjusted"] = {"mid": a_mid, "low": min(a_lo, a_hi), "high": max(a_lo, a_hi), "has_interval": lo_z is not None}
    out["by_rise"] = [{"rise": r, "status": _status(out["adjusted"]["low"], out["adjusted"]["high"], r)} for r in sorted(set(RISES + [rise_m]))]
    out["status"] = _status(out["adjusted"]["low"], out["adjusted"]["high"], rise_m)
    return out


# ----------------------------------------------------------------- region flood maps, raw vs corrected DEM (from etl/sdg/flood_region_cache.py)
REGION_CACHE = SDG / "hand/region_flood_cache.npz"


@lru_cache(maxsize=1)
def _region():
    if not REGION_CACHE.exists():
        raise HTTPException(503, "Regional flood maps are not built yet. Run: uv run python -I etl/sdg/flood_region_cache.py")
    z = np.load(REGION_CACHE, allow_pickle=False)
    return {"raw": z["raw"], "corrected": z["corrected"], "iso": z["iso"], "ha": z["ha"], "meta": json.loads(str(z["meta"]))}


@router.get("/chain/region")
def region_maps(rise_m: float = 2.0, country: str = "ALL"):
    """Flood map of the whole river-height box for 'the river rises X m', with the raw DEM and the corrected DEM side by side.
    Terrain what-if only (height above nearest river). It shows WHERE the correction moves the water line, not that it is more accurate."""
    R = _region()
    rises = R["meta"]["rises"]
    if country not in ("ALL", "IND", "NPL"):
        raise HTTPException(400, "country must be ALL, IND or NPL")
    try:
        i = [float(x) for x in rises].index(float(rise_m))
    except ValueError:
        raise HTTPException(400, f"rise_m must be one of {rises}")
    iso = R["iso"]
    keep = np.ones(iso.shape, dtype=bool) if country == "ALL" else (iso == (1 if country == "IND" else 2))
    fr, fc = R["raw"][i] / 255.0, R["corrected"][i] / 255.0
    mr, mc = (fr >= 0.5) & keep, (fc >= 0.5) & keep

    def png(layers):
        img = np.zeros(mr.shape + (4,), dtype=np.uint8)
        for mask, rgba in layers:
            img[mask] = rgba
        return base64.b64encode(_png(img)).decode()

    BLUE, VIOLET, AMBER = (37, 99, 235, 190), (139, 92, 246, 215), (245, 158, 11, 215)
    box = R["meta"]["box"]
    ha = R["ha"].astype("float64") / 100.0       # km2 per block
    out_stats = []
    for code, name in ((2, "NPL"), (1, "IND")):
        a, b = R["meta"]["stats"][f"raw|{rises[i]}|{name}"], R["meta"]["stats"][f"corrected|{rises[i]}|{name}"]
        m = iso == code
        out_stats.append({"iso": name, "raw": a, "corrected": b,
                          "moved_km2": float((np.abs(fc - fr) * ha)[m].sum())})
    return {
        "label": "Terrain what-if from height above the nearest river, raw vs corrected DEM. Not a forecast. Shows where the correction moves the water line, not that it is more accurate.",
        "rise_m": rise_m, "rises": rises, "country": country, "bounds": [[box[1], box[0]], [box[3], box[2]]], "block_m": 185,
        "images": {"raw": png([(mr, BLUE)]), "corrected": png([(mc, BLUE)]), "difference": png([(mr & mc, BLUE), (mc & ~mr, VIOLET), (mr & ~mc, AMBER)])},
        "stats": out_stats,
        "notes": ["Cells farther than about 12 km from a mapped river have no river-height value and are never counted as flooded.",
                  "Measured against satellite-seen floods, the raw and corrected DEM showed no measurable difference in flood-extent skill.",
                  "Map cells are about 185 m (6 arc-seconds); a cell is shown as flooded when at least half of it is."],
    }


# ----------------------------------------------------------------- district map
@lru_cache(maxsize=1)
def _geojson():
    g = json.load(open(GEOJSON, encoding="utf-8"))

    def rnd(c):
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]

    feats = [{"type": "Feature", "properties": {"did": f["properties"]["did"], "iso": f["properties"]["iso"], "name": f["properties"]["shapeName"]},
              "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}} for f in g["features"]]
    return {"type": "FeatureCollection", "features": feats}


@router.get("/geojson")
def geojson():
    if not GEOJSON.exists():
        raise HTTPException(503, "districts_ext.geojson not found")
    return _geojson()


def _did_to_key(df):
    """Match each boundary polygon (did) to its exposure rows by country + name; repeated names are split by nearest area."""
    t = pd.read_csv(TABLE)
    keys = df.drop_duplicates("district_key")[["district_key", "iso", "district", "district_area_km2"]]
    out, used = {}, set()
    for _, r in t.iterrows():
        c = keys[(keys.iso == r.iso) & (keys.district == r.shapeName) & (~keys.district_key.isin(used))]
        if c.empty:
            continue
        pick = c.iloc[(c.district_area_km2 - r.area_km2_in_region).abs().argsort()].iloc[0]
        out[int(r.did)] = pick.district_key
        used.add(pick.district_key)
    return out


@router.get("/map")
def district_map(year: str = "ever", bound: str = "upper_union", covered_only: bool = True):
    from . import sdg_routes as S
    df = S._load()
    y = S.EVER if year == "ever" else str(year)
    if y not in set(df.year):
        raise HTTPException(400, "bad year")
    if bound not in S.BOUND_LABELS:
        raise HTTPException(400, "bad bound")
    d = df[(df.year == y) & (df.bound == bound)].set_index("district_key")
    m = _did_to_key(df)
    t = pd.read_csv(TABLE).set_index("did")
    rows = []
    for did, key in m.items():
        if key not in d.index:
            continue
        r = d.loc[key]
        covered = bool(r.gfm_coverage >= S.COVER_MIN)
        rows.append({"did": did, "iso": t.loc[did, "iso"], "name": t.loc[did, "shapeName"], "covered": covered,
                     **{k: S._clean(float(r[k])) if pd.notna(r[k]) else None for k in
                        ("flooded_km2", "pop_exposed", "cropland_ha_exposed", "need_min_inr", "need_max_inr", "pct_pop", "pct_cropland")}})
    if covered_only:
        for r in rows:
            if not r["covered"]:
                for k in ("flooded_km2", "pop_exposed", "cropland_ha_exposed", "need_min_inr", "need_max_inr", "pct_pop", "pct_cropland"):
                    r[k] = None
    return {"year": year, "bound": bound, "covered_only": covered_only, "rows": rows}


# ----------------------------------------------------------------- Apple MapKit token (key stays on the server, in .env)
@router.get("/mapkit-token")
def mapkit_token(origin: str | None = None):
    team, kid, kp = (os.environ.get(k) for k in ("APPLE_MAPKIT_TEAM_ID", "APPLE_MAPKIT_KEY_ID", "APPLE_MAPKIT_PRIVATE_KEY_PATH"))
    if not (team and kid and kp):
        raise HTTPException(503, "Apple Maps is not configured. Set APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID and APPLE_MAPKIT_PRIVATE_KEY_PATH in .env.")
    try:
        import jwt
    except ImportError:
        raise HTTPException(501, "PyJWT is not installed. Run: uv add pyjwt cryptography")
    path = Path(kp) if Path(kp).is_absolute() else ROOT / kp
    if not path.exists():
        raise HTTPException(503, "The Apple private key file was not found at APPLE_MAPKIT_PRIVATE_KEY_PATH.")
    now = int(time.time())
    payload = {"iss": team, "iat": now, "exp": now + 1800}
    if origin and origin.startswith(("http://localhost", "http://127.0.0.1")):
        payload["origin"] = origin
    return {"token": jwt.encode(payload, path.read_text(), algorithm="ES256", headers={"kid": kid, "typ": "JWT"})}

CROP_JSON = SDG / "context/crop_yield_state.json"


@router.get("/context/crops")
def context_crops():
    """State crop yield from the APY table (written by etl/sdg/crop_yield_state.py). 404 with the instruction if not built yet."""
    if not CROP_JSON.exists():
        raise HTTPException(404, "Crop yield table not built yet. Run: uv run python -I etl/sdg/crop_yield_state.py")
    return json.loads(CROP_JSON.read_text(encoding="utf-8"))

ADM1_DIR = SDG / "context"
# names used in the reference tables -> spellings that appear in boundary files
_ADM1_KEYS = {
    "koshi": ["koshi", "province no 1", "province 1", "eastern"], "madhesh": ["madhesh", "madhes", "province no 2", "province 2"],
    "bagmati": ["bagmati", "province no 3", "province 3"], "gandaki": ["gandaki", "province no 4", "province 4"],
    "lumbini": ["lumbini", "province no 5", "province 5"], "karnali": ["karnali", "province no 6", "province 6"],
    "sudurpashchim": ["sudurpashchim", "sudur pashchim", "sudurpaschim", "far western", "province no 7", "province 7"],
    "uttar pradesh": ["uttar pradesh"], "bihar": ["bihar"],
}
_CANON = {"koshi": "Koshi", "madhesh": "Madhesh", "bagmati": "Bagmati", "gandaki": "Gandaki", "lumbini": "Lumbini", "karnali": "Karnali",
          "sudurpashchim": "Sudurpashchim", "uttar pradesh": "Uttar Pradesh", "bihar": "Bihar"}


def _norm(x):
    return " ".join("".join(ch if ch.isalnum() else " " for ch in str(x).lower()).split())


def _canon(name):
    n = _norm(name)
    if n.endswith(" province"):
        n = n[: -len(" province")]
    for key, spellings in _ADM1_KEYS.items():
        if n in [_norm(sp) for sp in spellings]:
            return _CANON[key]
    return None


def _in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi, xj, yj = ring[i][0], ring[i][1], ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _in_geom(x, y, geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for rings in polys:
        if _in_ring(x, y, rings[0]) and not any(_in_ring(x, y, h) for h in rings[1:]):
            return True
    return False


@lru_cache(maxsize=1)
def _adm1():
    out = []
    for iso in ("IND", "NPL"):
        f = ADM1_DIR / f"adm1_{iso}.geojson"
        if not f.exists():
            continue
        for ft in json.loads(f.read_text(encoding="utf-8"))["features"]:
            out.append((iso, ft["properties"].get("name"), ft["geometry"]))
    return out


@router.get("/context/admin1")
def context_admin1(lat: float, lon: float):
    """State or province that contains the point (boundary files written by etl/sdg/fetch_adm1.py). 404 with the instruction if missing."""
    items = _adm1()
    if not items:
        raise HTTPException(404, "State and province boundaries not built yet. Run: uv run python -I etl/sdg/fetch_adm1.py")
    for iso, name, geom in items:
        if _in_geom(lon, lat, geom):
            return {"iso": iso, "name": name, "key": _canon(name)}
    return {"iso": None, "name": None, "key": None}

# ----------------------------------------------------------------- 3D scene: buildings, people, crops, terrain around one place (raw vs corrected)
DEM_FILES = {"raw": ROOT / "data/final/corrected_rasters/raw_dem_2022.tif", "corrected": ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif"}
DEM_W, DEM_N = 80.0, 28.0            # both DEM rasters: 1 arc-second grid starting at 80 E, 28 N
BLD_DIRS = [ROOT / "data/external/buildings/vida", ROOT / "data/external/buildings/vida_npl"]
MAX_BUILDINGS = 6000


def _wkb_ring(b):
    """First outer ring of a WKB Polygon or MultiPolygon as a list of (lon, lat). Returns None if the type is not handled."""
    try:
        o = "<" if b[0] == 1 else ">"
        t = struct.unpack_from(o + "I", b, 1)[0] & 0xFFFF
        pos = 5
        if t == 6:                                   # MultiPolygon: use the first polygon
            pos += 4
            o = "<" if b[pos] == 1 else ">"
            pos += 5
        elif t != 3:
            return None
        nr = struct.unpack_from(o + "I", b, pos)[0]
        pos += 4
        if nr < 1:
            return None
        n = struct.unpack_from(o + "I", b, pos)[0]
        pos += 4
        pts = struct.unpack_from(o + "%dd" % (2 * n), b, pos)
        return [(pts[2 * i], pts[2 * i + 1]) for i in range(n)]
    except Exception:
        return None


def _b64_i16(a):
    return base64.b64encode(a.astype("<i2").tobytes()).decode("ascii")


@router.get("/chain/scene")
def chain_scene(lat: float, lon: float, radius_km: float = 2.0, rise_m: float = 2.0):
    """Everything the 3D view needs around one place: terrain (raw and corrected), buildings, people cells and cropland cells, each marked flooded at the
    chosen river rise with the raw DEM, the corrected DEM, both, or neither. Same HAND rule as the maps. Heights of buildings are NOT in the data."""
    if not (0.5 <= radius_km <= 3.0):
        raise HTTPException(400, "radius_km must be between 0.5 and 3 for the 3D view")
    if not (0.25 <= rise_m <= 15):
        raise HTTPException(400, "rise_m must be between 0.25 and 15")
    w_, s_, e_, n_ = HAND_BOX
    if not (w_ <= lon <= e_ and s_ <= lat <= n_):
        raise HTTPException(400, "This place is outside the river-height layer (81.9-84.0 E, 25.4-28.0 N).")
    for pth in list(HAND.values()) + [BASE / "pop_2020.tif", BASE / "cropland_frac.tif"]:
        if not pth.exists():
            raise HTTPException(503, f"Missing data file: {pth.name}. Run the etl/sdg steps first.")
    dlat = radius_km / KM_DEG
    dlon = radius_km / (KM_DEG * math.cos(math.radians(lat)))
    west, east, south, north = max(lon - dlon, w_), min(lon + dlon, e_), max(lat - dlat, s_), min(lat + dlat, n_)
    c0, r0 = int(math.floor((west - w_) * 3600)), int(math.floor((n_ - north) * 3600))
    c1, r1 = int(math.ceil((east - w_) * 3600)), int(math.ceil((n_ - south) * 3600))
    wf, hf = c1 - c0, r1 - r0
    hand = {k: _read(pth, c0, r0, wf, hf).astype("float32") for k, pth in HAND.items()}
    bw, bn = w_ + c0 / 3600, n_ - r0 / 3600                     # window west / north edge in degrees

    def status_at(x, y):
        """-1 no river-height value, 0 dry, 1 flooded in both, 2 corrected only, 3 raw only."""
        c, r = int((x - bw) * 3600), int((bn - y) * 3600)
        if not (0 <= c < wf and 0 <= r < hf):
            return -2
        hr, hc = float(hand["raw"][r, c]), float(hand["corrected"][r, c])
        ok_r, ok_c = hr > -9990 and math.isfinite(hr), hc > -9990 and math.isfinite(hc)
        if not (ok_r and ok_c):
            return -1
        fr, fc = hr <= rise_m, hc <= rise_m
        return 1 if (fr and fc) else 2 if fc else 3 if fr else 0

    def inside(x, y):
        return ((x - lon) * KM_DEG * math.cos(math.radians(lat))) ** 2 + ((y - lat) * KM_DEG) ** 2 <= radius_km ** 2

    # --- people and cropland cells (3 arc-second)
    cc0, rr0 = int(math.floor((west - W0) / PX)), int(math.floor((N0 - north) / PX))
    cw, ch = int(math.ceil((east - W0) / PX)) - cc0, int(math.ceil((N0 - south) / PX)) - rr0
    pop = _read(BASE / "pop_2020.tif", cc0, rr0, cw, ch).astype("float64")
    cropf = _read(BASE / "cropland_frac.tif", cc0, rr0, cw, ch).astype("float64")
    pop = np.where(pop > -9000, pop, 0.0)
    cropf = np.where(cropf > -9000, cropf, 0.0)
    cells, tot = [], {k: {"people": 0.0, "crop_ha": 0.0} for k in ("all", "raw", "corrected", "both", "corrected_only", "raw_only", "no_river")}
    for i in range(ch):
        y = N0 - (rr0 + i + 0.5) * PX
        area_ha = (PX * KM_DEG) * (PX * KM_DEG * math.cos(math.radians(y))) * 100.0
        for j in range(cw):
            x = W0 + (cc0 + j + 0.5) * PX
            pv, cv = float(pop[i, j]), float(cropf[i, j]) * area_ha
            if (pv < 0.5 and cv < 0.05) or not inside(x, y):
                continue
            st = status_at(x, y)
            if st == -2:
                continue
            tot["all"]["people"] += pv; tot["all"]["crop_ha"] += cv
            key = {-1: "no_river", 1: "both", 2: "corrected_only", 3: "raw_only"}.get(st)
            if key:
                tot[key]["people"] += pv; tot[key]["crop_ha"] += cv
            if st in (1, 3):
                tot["raw"]["people"] += pv; tot["raw"]["crop_ha"] += cv
            if st in (1, 2):
                tot["corrected"]["people"] += pv; tot["corrected"]["crop_ha"] += cv
            cells.append([round(x, 5), round(y, 5), round(pv, 1), round(cv, 2), st])

    # --- buildings (VIDA footprints on disk). Heights are not in the data.
    buildings, bcount = [], {k: 0 for k in ("all", "raw", "corrected", "both", "corrected_only", "raw_only", "no_river")}
    bnote = None
    files = []
    x_lo, x_hi, y_lo, y_hi = west, east, south, north
    for d in BLD_DIRS:
        for f in sorted(d.glob("buildings_*.parquet")) if d.exists() else []:
            try:
                fx, fy = (float(v) for v in f.stem.split("_")[1:3])
                if fx + 0.25 < x_lo or fx > x_hi or fy + 0.25 < y_lo or fy > y_hi:
                    continue
            except ValueError:
                pass
            files.append(f.as_posix())
    if not files:
        bnote = "Building footprints were not found under data/external/buildings. The 3D view shows people, crops and terrain only."
    else:
        try:
            import duckdb
            con = duckdb.connect()
            q = ("SELECT xmin, ymin, xmax, ymax, geometry_wkb FROM read_parquet([" + ",".join("'%s'" % f for f in files) + "]) "
                 f"WHERE xmax >= {x_lo} AND xmin <= {x_hi} AND ymax >= {y_lo} AND ymin <= {y_hi}")
            rows = con.execute(q).fetchall()
        except Exception as e:  # noqa: BLE001
            rows, bnote = [], f"Building footprints could not be read ({str(e)[:80]})."
        cand = []
        for xmin, ymin, xmax, ymax, wkb in rows:
            cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
            if not inside(cx, cy):
                continue
            st = status_at(cx, cy)
            if st == -2:
                continue
            bcount["all"] += 1
            key = {-1: "no_river", 1: "both", 2: "corrected_only", 3: "raw_only"}.get(st)
            if key:
                bcount[key] += 1
            if st in (1, 3):
                bcount["raw"] += 1
            if st in (1, 2):
                bcount["corrected"] += 1
            cand.append((0 if st > 0 else 1, (cx - lon) ** 2 + (cy - lat) ** 2, st, xmin, ymin, xmax, ymax, wkb))
        cand.sort(key=lambda t: (t[0], t[1]))
        for _, _, st, xmin, ymin, xmax, ymax, wkb in cand[:MAX_BUILDINGS]:
            ring = _wkb_ring(bytes(wkb)) if wkb is not None else None
            if not ring or len(ring) > 14:
                ring = [(xmin, ymin), (xmax, ymin), (xmax, ymax), (xmin, ymax), (xmin, ymin)]
            flat = [round(v, 5) for pt in ring[:-1] for v in pt]
            buildings.append([st, flat])
        if len(cand) > MAX_BUILDINGS:
            bnote = f"{len(cand):,} buildings lie inside the circle. The {MAX_BUILDINGS:,} drawn are the affected ones first, then the nearest. Counts include all of them."

    # --- terrain from the raw and corrected DEM, about 90 m grid
    terrain = None
    if all(f.exists() for f in DEM_FILES.values()):
        dc0, dr0 = int(math.floor((west - DEM_W) * 3600)), int(math.floor((DEM_N - north) * 3600))
        dw, dh = int(math.ceil((east - DEM_W) * 3600)) - dc0, int(math.ceil((DEM_N - south) * 3600)) - dr0
        arr = {k: _read(f, dc0, dr0, dw, dh).astype("float32") for k, f in DEM_FILES.items()}
        st3 = 3
        ny, nx = (dh // st3), (dw // st3)
        out = {}
        for k, a in arr.items():
            a = a[: ny * st3, : nx * st3].reshape(ny, st3, nx, st3)
            with np.errstate(all="ignore"):
                m = np.nanmean(np.where(a > -9000, a, np.nan), axis=(1, 3))
            out[k] = m
        base = float(np.nanmin(out["corrected"])) if np.isfinite(out["corrected"]).any() else 0.0
        tb_w, tb_n = DEM_W + dc0 / 3600, DEM_N - dr0 / 3600
        stat = np.full((ny, nx), 9, dtype="u1")                  # 9 = no river-height value or outside the HAND window
        for i in range(ny):
            for j in range(nx):
                v = status_at(tb_w + (j + 0.5) * st3 / 3600, tb_n - (i + 0.5) * st3 / 3600)
                if v >= 0:
                    stat[i, j] = v
        terrain = {"status": base64.b64encode(stat.tobytes()).decode("ascii"), "nx": nx, "ny": ny, "bounds": [DEM_W + dc0 / 3600, DEM_N - (dr0 + ny * st3) / 3600, DEM_W + (dc0 + nx * st3) / 3600, DEM_N - dr0 / 3600],
                   "base_m": round(base, 2), "unit": "decimetres above base_m, int16 little-endian, row 0 = north",
                   "raw": _b64_i16(np.nan_to_num((out["raw"] - base) * 10, nan=0)), "corrected": _b64_i16(np.nan_to_num((out["corrected"] - base) * 10, nan=0))}

    return {"label": "3D view of a what-if river rise on raw and corrected elevation. Exposure only, not damage. Not a forecast.",
            "point": {"lat": lat, "lon": lon}, "radius_km": radius_km, "rise_m": rise_m,
            "bounds": [west, south, east, north], "buildings": buildings, "cells": cells, "terrain": terrain,
            "totals": {"buildings": bcount, "cells": {k: {"people": round(v["people"]), "crop_ha": round(v["crop_ha"], 1)} for k, v in tot.items()}},
            "status_codes": {"-1": "no river-height value", "0": "dry in both", "1": "under water in both", "2": "under water only with the corrected DEM", "3": "under water only with the raw DEM"},
            "notes": [n for n in [bnote, "Building heights are not in the data. Blocks use one standard height and carry no information about the real building.",
                                  "People and crops are 3 arc-second (about 90 m) grid cells, classed by the river-height value at the cell centre."] if n]}
