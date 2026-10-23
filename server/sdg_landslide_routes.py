"""GET /api/sdg/landslide/status and /api/sdg/landslide/point : steep-ground screening (patch 15). Read-only.
Slope comes from the raw and corrected DEM (data/processed/sdg/landslide/slope_*_deg.tif, built by etl/landslide/build_slope.py).
Rain (optional day) comes from CHIRPS daily files on disk and is compared with published global rainfall thresholds from landslide_config.json.
Nothing is invented: missing layers, days or files give a plain message. The card in the app shows only where ground is steep."""
import glob, json, math, re
from datetime import date, timedelta
from pathlib import Path
import numpy as np
from fastapi import APIRouter

router = APIRouter()
ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "processed" / "sdg" / "landslide"; CFG = ROOT / "etl" / "landslide" / "landslide_config.json"
CHIRPS = str(ROOT / "data" / "external" / "rainfall" / "chirps" / "*" / "*.tif.gz")
DEFAULT = {"steep_slope_classes_deg": [15, 25, 35], "show_card_if_share_at_or_above_15deg": 0.10, "durations_h": [24, 72, 240],
           "rain_thresholds": [{"id": "caine_1980", "label": "Global rainfall threshold for landslides (Caine 1980)", "a": 14.82, "b": -0.39}, {"id": "guzzetti_2008", "label": "Lowest global threshold (Guzzetti et al. 2008)", "a": 2.20, "b": -0.44}],
           "status": "Screening. Slope and a rain comparison, not a landslide forecast."}
_files = {}

def _cfg():
    try: return {**DEFAULT, **json.loads(CFG.read_text(encoding="utf-8"))}
    except Exception: return DEFAULT

def _read(name):
    try: return json.loads((DIR / name).read_text(encoding="utf-8"))
    except Exception: return None

def _chirps_index():
    if not _files:
        for f in glob.glob(CHIRPS):
            m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\.tif", f)
            if m: _files[date(int(m[1]), int(m[2]), int(m[3]))] = f
    return _files

def _slope_stats(path, lon, lat, r_km, classes):
    import rasterio
    from rasterio.windows import from_bounds, Window
    with rasterio.open(path) as ds:
        b = ds.bounds
        if not (b.left <= lon <= b.right and b.bottom <= lat <= b.top): return None
        dlat = r_km / 110.574; dlon = r_km / (111.32 * math.cos(math.radians(lat)))
        w = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, ds.transform).round_offsets().round_lengths().intersection(Window(0, 0, ds.width, ds.height))
        if w.width < 1 or w.height < 1: return None
        a = ds.read(1, window=w).astype("float64"); tr = ds.window_transform(w)
    ys = tr.f + (np.arange(a.shape[0]) + 0.5) * tr.e; xs = tr.c + (np.arange(a.shape[1]) + 0.5) * tr.a
    d = np.hypot((ys[:, None] - lat) * 110.574, (xs[None, :] - lon) * 111.32 * math.cos(math.radians(lat))); v = a[(d <= r_km) & (a != 255)]
    if v.size == 0: return None
    return {"median_deg": float(np.median(v)), "p95_deg": float(np.percentile(v, 95)), "max_deg": float(v.max()), "cells": int(v.size), **{f"share_ge_{c}": float((v >= c).mean()) for c in classes}}

def _rain_cell(day, lon, lat):
    import rasterio
    f = _chirps_index().get(day)
    if not f: return None
    with rasterio.open("/vsigzip/" + f.replace("\\", "/")) as r:
        row, col = r.index(lon, lat)
        if row < 0 or col < 0 or row >= r.height or col >= r.width: return None
        v = float(r.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])
    return None if v < 0 else v

def _rain(day, lon, lat, c):
    idx = _chirps_index()
    if not idx: return {"available": False, "message": "No CHIRPS rainfall files were found on this machine."}
    dmin, dmax = min(idx), max(idx)
    if day not in idx: return {"available": False, "message": f"There is no rainfall file for that day. Files cover {dmin.isoformat()} to {dmax.isoformat()} (June to October only).", "date_range": [dmin.isoformat(), dmax.isoformat()]}
    tot = {}
    for h in c["durations_h"]:
        n = max(1, h // 24); vals = [_rain_cell(day - timedelta(days=k), lon, lat) for k in range(n)]
        tot[h] = None if any(v is None for v in vals) else float(sum(vals))
    levels = []; best = None
    for th in c["rain_thresholds"]:
        row = {"id": th["id"], "label": th["label"], "by_duration": []}
        for h in c["durations_h"]:
            need = th["a"] * h ** (1 + th["b"]); got = tot[h]
            row["by_duration"].append({"hours": h, "threshold_mm": round(need, 1), "rain_mm": None if got is None else round(got, 1), "ratio": None if got is None else round(got / need, 2)})
        ratios = [x["ratio"] for x in row["by_duration"] if x["ratio"] is not None]; row["max_ratio"] = max(ratios) if ratios else None; levels.append(row)
    hi = next((l for l in levels if l["id"] == "caine_1980"), levels[0] if levels else None); lo = next((l for l in levels if l["id"] == "guzzetti_2008"), None)
    if hi and hi["max_ratio"] is not None:
        if hi["max_ratio"] >= 1: level = "at_or_above"; text = "Rain on this day reached the global landslide rain threshold."
        elif lo and lo["max_ratio"] is not None and lo["max_ratio"] >= 1: level = "between"; text = "Rain was above the lowest global threshold (passed often in monsoon rain) but below the higher one."
        else: level = "below"; text = "Rain was below both global thresholds."
    else: level = None; text = "Some of the days needed for the rain total are missing."
    return {"available": True, "date": day.isoformat(), "date_range": [dmin.isoformat(), dmax.isoformat()], "level": level, "text": text, "thresholds": levels,
            "note": "CHIRPS daily rain for the cell at this place. Daily totals can read low for short heavy rain. The thresholds are global and were not fitted to this area."}

@router.get("/landslide/status")
def status():
    v = _read("landslide_validation.json"); have = (DIR / "slope_corrected_deg.tif").exists()
    return {"slope_layers_built": have, "validation": None if not v else {"verdict": v.get("verdict"), "events_used": v.get("events_used"), "event_years": v.get("event_years"), "hill_places": v.get("hill_places"), "all_places": v.get("all_places"), "caveats": v.get("caveats")},
            "message": None if have else "The slope layers are not built yet (run etl/landslide/build_slope.py)."}

@router.get("/landslide/point")
def point(lat: float, lon: float, radius_km: float = 10.0, day: str | None = None):
    c = _cfg(); r_km = float(min(max(radius_km, 1.0), 15.0)); out = {"found": False, "show": False, "label": c["status"]}
    if not (DIR / "slope_corrected_deg.tif").exists(): out["message"] = "The slope layers are not built yet."; return out
    cl = c["steep_slope_classes_deg"]; cor = _slope_stats(DIR / "slope_corrected_deg.tif", lon, lat, r_km, cl); raw = _slope_stats(DIR / "slope_raw_deg.tif", lon, lat, r_km, cl) if (DIR / "slope_raw_deg.tif").exists() else None
    if cor is None: out["message"] = "This place is outside the elevation model."; return out
    out.update({"found": True, "radius_km": r_km, "slope": {"corrected": cor, "raw": raw}, "steep_classes_deg": cl})
    out["show"] = bool(cor.get("share_ge_15", 0) >= c["show_card_if_share_at_or_above_15deg"])
    if out["show"] and day:
        try: out["rain"] = _rain(date.fromisoformat(day), lon, lat, c)
        except ValueError: out["rain"] = {"available": False, "message": "The day must be written as YYYY-MM-DD."}
    out["caveats"] = ["Slope is computed from the elevation model. The elevation correction was tested on plains and Terai, not on steep ground.", "This is a screening, not a forecast. No rain forecast is used.", "Recorded landslides are not drawn here."]
    return out
