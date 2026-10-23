"""Patch 15, step 3: does steep ground separate real landslide locations from random places?  Writes data/processed/sdg/landslide/landslide_validation.json.
  uv run python -I etl/landslide/validate_glc.py
Score of a place = the 95th-percentile slope inside a circle whose radius is the catalog's stated location accuracy (at most --max-radius-km).
Two comparisons: (all) landslide places against random places anywhere in the elevation box, and (hill) landslide places against random places at --hill-elev m or higher
(so plains do not flatter the result). AUC with a bootstrap interval, for the slope from the raw and from the corrected DEM.
This tests the SLOPE part only. The rain-trigger part cannot be tested here: the CHIRPS files on disk cover 2019-2025 and the catalog export ends in 2016."""
import argparse, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np, pandas as pd, rasterio
from rasterio.windows import from_bounds, Window
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; DIR = ROOT / "data" / "processed" / "sdg" / "landslide"

def auc(score, truth):
    from scipy.stats import rankdata
    n1 = int(truth.sum()); n0 = truth.size - n1
    if n1 == 0 or n0 == 0: return float("nan")
    return float((rankdata(score)[truth].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

def p95_circle(ds, lon, lat, r_km):
    import math
    dlat = r_km / 110.574; dlon = r_km / (111.32 * math.cos(math.radians(lat)))
    w = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, ds.transform).round_offsets().round_lengths().intersection(Window(0, 0, ds.width, ds.height))
    if w.width < 1 or w.height < 1: return np.nan
    a = ds.read(1, window=w).astype("float64"); tr = ds.window_transform(w)
    ys = tr.f + (np.arange(a.shape[0]) + 0.5) * tr.e; xs = tr.c + (np.arange(a.shape[1]) + 0.5) * tr.a
    d = np.hypot((ys[:, None] - lat) * 110.574, (xs[None, :] - lon) * 111.32 * math.cos(math.radians(lat))); v = a[(d <= r_km) & (a != 255)]
    return float(np.percentile(v, 95)) if v.size else np.nan

def acc_km(s):
    m = re.search(r"([\d.]+)\s*km", str(s).lower()); return float(m.group(1)) if m else (0.5 if "exact" in str(s).lower() else np.nan)

def boot(sr, sc, y, n=1000, seed=0):
    rng = np.random.default_rng(seed); idx1 = np.flatnonzero(y); idx0 = np.flatnonzero(~y); out = []
    for _ in range(n):
        i = np.concatenate([rng.choice(idx1, idx1.size), rng.choice(idx0, idx0.size)]); out.append((auc(sr[i], y[i]), auc(sc[i], y[i])))
    o = np.array(out); lo, hi = np.nanpercentile(o[:, 1], [2.5, 97.5]); d = o[:, 1] - o[:, 0]; dl, dh = np.nanpercentile(d, [2.5, 97.5])
    return {"auc_corrected_ci95": [float(lo), float(hi)], "auc_corrected_minus_raw_ci95": [float(dl), float(dh)]}

def compare(ev, ctl):
    y = np.r_[np.ones(len(ev["raw"]), bool), np.zeros(len(ctl["raw"]), bool)]; sr = np.r_[ev["raw"], ctl["raw"]]; sc = np.r_[ev["cor"], ctl["cor"]]; ok = np.isfinite(sr) & np.isfinite(sc)
    y, sr, sc = y[ok], sr[ok], sc[ok]
    if y.sum() < 5: return {"n_events": int(y.sum()), "note": "too few events to score"}
    return {"n_events": int(y.sum()), "n_controls": int((~y).sum()), "auc_raw": auc(sr, y), "auc_corrected": auc(sc, y), **boot(sr, sc, y)}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--glc", default=str(ROOT / "data/external/landslides/coolr/coolr_events_points.csv"))
    ap.add_argument("--slope-raw", default=str(DIR / "slope_raw_deg.tif")); ap.add_argument("--slope-corrected", default=str(DIR / "slope_corrected_deg.tif")); ap.add_argument("--dem", default=str(ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif"))
    ap.add_argument("--max-radius-km", type=float, default=5.0); ap.add_argument("--default-radius-km", type=float, default=2.0, help="used when the file gives no location accuracy"); ap.add_argument("--hill-elev", type=float, default=250.0); ap.add_argument("--controls", type=int, default=10); ap.add_argument("--out", default=str(DIR / "landslide_validation.json")); ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    if not Path(a.glc).exists(): sys.exit(f"STOP: {a.glc} not found. Run etl/landslide/fetch_glc.py first.")
    df = pd.read_csv(a.glc, low_memory=False); df.columns = [c.strip().lower() for c in df.columns]; lat = next((c for c in df.columns if c in ("latitude", "lat")), None); lon = next((c for c in df.columns if c in ("longitude", "lon", "lng")), None)
    if not lat or not lon: sys.exit(f"STOP: no latitude/longitude columns. Columns: {list(df.columns)[:30]}")
    accc = next((c for c in df.columns if "accuracy" in c), None); datec = next((c for c in df.columns if c in ("event_date", "date") or c.endswith("_date")), None)
    df = df.dropna(subset=[lat, lon]).copy(); df["r_km"] = (df[accc].map(acc_km) if accc else np.nan); df["r_km"] = df["r_km"].fillna(a.default_radius_km)
    rs, rc, rd = rasterio.open(a.slope_raw), rasterio.open(a.slope_corrected), rasterio.open(a.dem); b = rc.bounds
    inbox = df[(df[lon] >= b.left) & (df[lon] <= b.right) & (df[lat] >= b.bottom) & (df[lat] <= b.top)]
    used = inbox[inbox["r_km"] <= a.max_radius_km].copy(); src = next((c for c in df.columns if "import_source" in c), None)
    if src: print("rows by source:", df[src].value_counts().to_dict())
    print(f"catalog rows {len(df)}; inside the elevation box {len(inbox)}; with location accuracy <= {a.max_radius_km} km: {len(used)}")
    def score(lons, lats, rks):
        return {"raw": np.array([p95_circle(rs, x, y, r) for x, y, r in zip(lons, lats, rks)]), "cor": np.array([p95_circle(rc, x, y, r) for x, y, r in zip(lons, lats, rks)])}
    def elev(x, y):
        try: return float(next(rd.sample([(x, y)]))[0])
        except Exception: return np.nan
    rng = np.random.default_rng(a.seed); ev_el = np.array([elev(x, y) for x, y in zip(used[lon], used[lat])]); ev = score(used[lon].to_numpy(), used[lat].to_numpy(), used["r_km"].to_numpy()); hill = ev_el >= a.hill_elev
    nc = max(len(used) * a.controls, 300); cl = rng.uniform(b.left, b.right, nc * 3); ca = rng.uniform(b.bottom, b.top, nc * 3); rk = rng.choice(used["r_km"].to_numpy() if len(used) else np.array([2.0]), nc * 3)
    cel = np.array([elev(x, y) for x, y in zip(cl, ca)]); valid = np.isfinite(cel); cl, ca, rk, cel = cl[valid], ca[valid], rk[valid], cel[valid]
    allc = slice(0, nc); cs = score(cl[allc], ca[allc], rk[allc]); hm = cel >= a.hill_elev; hc = score(cl[hm][:nc], ca[hm][:nc], rk[hm][:nc])
    res = {"built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "glc_rows": int(len(df)), "rows_inside_elevation_box": int(len(inbox)), "events_used": int(len(used)), "max_radius_km": a.max_radius_km, "hill_elevation_m": a.hill_elev,
           "all_places": compare({"raw": ev["raw"], "cor": ev["cor"]}, cs), "hill_places": compare({"raw": ev["raw"][hill], "cor": ev["cor"][hill]}, hc), "event_years": None}
    if datec: yrs = pd.to_datetime(used[datec], errors="coerce").dt.year.dropna().astype(int); res["event_years"] = [int(yrs.min()), int(yrs.max())] if len(yrs) else None
    h = res["hill_places"]; supported = bool(h.get("n_events", 0) >= 30 and h.get("auc_corrected_ci95", [0])[0] > 0.5)
    res["verdict"] = {"slope_screen_supported": supported, "text": ("Steep ground separates recorded landslide places from random hill places in this area (hill events >= 30 and the 95% interval stays above 0.5). This tests slope only." if supported else
                      "Not shown: fewer than 30 usable hill events, or the interval includes 0.5. The screen is shown as unvalidated.")}
    res["caveats"] = ["Catalog locations are approximate (accuracy stated per event where given; otherwise the default radius is used; events above the radius limit are dropped).", "The catalog is a news-and-report based export, so it misses landslides that were not reported.",
                      "The rain trigger is not tested here (CHIRPS on disk is 2019-2025; the export ends in 2016).", "The corrected DEM was validated on plains and Terai; its accuracy on steep ground is untested."]
    Path(a.out).parent.mkdir(parents=True, exist_ok=True); Path(a.out).write_text(json.dumps(res, indent=1), encoding="utf-8"); print(json.dumps(res["all_places"], indent=1)); print(json.dumps(res["hill_places"], indent=1)); print("verdict:", res["verdict"]["text"]); print("wrote", a.out)

if __name__ == "__main__": main()
