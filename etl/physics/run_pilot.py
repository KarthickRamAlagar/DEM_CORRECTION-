"""Physics flood pilot (patch 14).  Local-inertial shallow-water model on a small window, raw DEM against corrected DEM, scored against satellite-observed floods and against the terrain what-if (HAND).
It writes ONLY under data/processed/sdg/physics/ .  It never changes the existing pipeline or app numbers.
  uv run python -I etl/physics/run_pilot.py --center 82.5,26.9 --channel <rivers file> --events etl/physics/events.json
Inputs
  --raw / --corrected   DEM GeoTIFFs (default data/final/corrected_rasters/raw_dem_2022.tif and corrected_dem_2022.tif; geographic or metric grid)
  --channel             river lines (any file geopandas can read) or a 0/1 raster. These cells are held at a river level that rises with time.
  --events              JSON list: [{"name","obs_date":"YYYY-MM-DD","observed":"binary flood raster: 1 flood, 0 dry, anything else = no data", "stage_csv":"optional date,rise_m"}]
  river level per day   from GloFAS reanalysis flow at the nearest large river cell (levels from the forecast model: flow at mean, 1-in-2, 1-in-5 and 1-in-20 year -> 0, 1, 2 and 4 m rise, planning assumption), or --stage-csv.
What is compared on the day of each observed scene: the model's water depth (>= 0.1 m) against the terrain what-if for the same river rise, using the same cells and the same observed mask.
The gate file physics_gate.json says whether the physics beats the terrain what-if.  The app shows the pilot only when passed = true."""
import argparse, json, math, sys, time
from pathlib import Path
from datetime import datetime, timedelta, timezone
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(Path(__file__).resolve().parent))
from solver import Solver
OUT = ROOT / "data" / "processed" / "sdg" / "physics"
TIERS = [0.0, 1.0, 2.0, 4.0]   # river rise (m) at mean flow, RL2, RL5, RL20 (same planning assumption as the forecast card)

# ---------- grid helpers ----------
def read_window(path, lon, lat, half_km):
    import rasterio
    from rasterio.windows import from_bounds
    with rasterio.open(path) as ds:
        if ds.crs and ds.crs.is_geographic:
            dlat = half_km / 110.574; dlon = half_km / (111.320 * math.cos(math.radians(lat))); b = (lon - dlon, lat - dlat, lon + dlon, lat + dlat)
        else:
            from pyproj import Transformer
            x, y = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True).transform(lon, lat); b = (x - half_km * 1000, y - half_km * 1000, x + half_km * 1000, y + half_km * 1000)
        win = from_bounds(*b, transform=ds.transform).round_offsets().round_lengths()
        a = ds.read(1, window=win, masked=True).astype("float64").filled(np.nan); tr = ds.window_transform(win); crs = ds.crs
    return a, tr, crs

def cell_size_m(tr, crs, lat):
    if crs is not None and crs.is_geographic: return abs(tr.a) * 111320.0 * math.cos(math.radians(lat)), abs(tr.e) * 110574.0
    return abs(tr.a), abs(tr.e)

def block(a, k, how):
    ny, nx = (a.shape[0] // k) * k, (a.shape[1] // k) * k; b = a[:ny, :nx].reshape(ny // k, k, nx // k, k)
    with np.errstate(all="ignore"):
        if how == "mean": return np.nanmean(b, axis=(1, 3))
        if how == "min": return np.nanmin(b, axis=(1, 3))
        if how == "max": return np.nanmax(b, axis=(1, 3))

def channel_mask(path, tr, shape, crs):
    import rasterio
    from rasterio import features
    p = Path(path)
    if p.suffix.lower() in (".tif", ".tiff", ".vrt"):
        from rasterio.warp import reproject, Resampling
        dst = np.zeros(shape, dtype="float32")
        with rasterio.open(p) as ds: reproject(rasterio.band(ds, 1), dst, dst_transform=tr, dst_crs=crs, resampling=Resampling.max)
        return dst > 0
    try: import geopandas as gpd
    except Exception: sys.exit("STOP: geopandas is needed to read a river vector file (uv add geopandas), or pass a 0/1 raster with --channel.")
    g = gpd.read_file(p)
    if g.crs is not None and crs is not None: g = g.to_crs(crs)
    return features.rasterize(((geom, 1) for geom in g.geometry if geom is not None and not geom.is_empty), out_shape=shape, transform=tr, all_touched=True, fill=0, dtype="uint8").astype(bool)

def observed_on_grid(path, tr, shape, crs, k):
    import rasterio
    from rasterio.warp import reproject, Resampling
    fl = np.zeros(shape, dtype="float32"); va = np.zeros(shape, dtype="float32")
    with rasterio.open(path) as ds:
        raw = ds.read(1)
        for arr, dst in ((np.where(raw == 1, 1.0, 0.0).astype("float32"), fl), (np.where((raw == 0) | (raw == 1), 1.0, 0.0).astype("float32"), va)):
            reproject(arr, dst, src_transform=ds.transform, src_crs=ds.crs, dst_transform=tr, dst_crs=crs, resampling=Resampling.average)
    return block(fl, k, "mean"), block(va, k, "mean")

# ---------- river level from flow ----------
def rise_from_flow(q, mean, rl2, rl5, rl20):
    xs = [mean, rl2, rl5, rl20]
    if not all(np.isfinite(xs)) or not (xs[0] < xs[1] < xs[2] < xs[3]): return np.full_like(np.asarray(q, float), np.nan)
    r = np.interp(q, xs, TIERS); over = np.asarray(q) > rl20; slope = (TIERS[3] - TIERS[2]) / (rl20 - rl5)
    return np.where(over, np.minimum(TIERS[3] + (np.asarray(q) - rl20) * slope, 8.0), r)

def stage_from_glofas(lon, lat, d0, d1, radius_km=15.0):
    sys.path.insert(0, str(ROOT / "etl" / "forecast"))
    from glofas_io import read_history
    L = np.load(ROOT / "data" / "processed" / "sdg" / "forecast" / "glofas_levels.npz"); la, lo = L["lat"], L["lon"]
    LA, LO = np.meshgrid(la, lo, indexing="ij"); d = np.hypot((LA - lat) * 110.574, (LO - lon) * 111.32 * math.cos(math.radians(lat)))
    ok = (d <= radius_km) & L["river"].astype(bool)
    if not ok.any(): sys.exit(f"STOP: no large river cell within {radius_km} km of {lon},{lat}.")
    mx = np.nanmax(np.where(ok, L["mean"], np.nan)); cand = ok & (L["mean"] >= 0.8 * mx); i, j = np.unravel_index(np.argmin(np.where(cand, d, np.inf)), d.shape)
    series = {}
    for y in range(d0.year, d1.year + 1):
        f = ROOT / "data" / "external" / "glofas" / "historical" / f"glofas_hist_{y}.nc"
        if not f.exists(): sys.exit(f"STOP: {f} not found (download the GloFAS history for {y}).")
        dates, hla, hlo, arr = read_history(f)
        ii = int(np.argmin(abs(hla - la[i]))); jj = int(np.argmin(abs(hlo - lo[j])))
        for t, v in zip(dates, arr[:, ii, jj]): series[t.normalize()] = float(v)
    days = [d0 + timedelta(days=n) for n in range((d1 - d0).days + 1)]
    import pandas as pd
    days = [pd.Timestamp(x).normalize() for x in days]; miss = [x for x in days if x not in series]
    if miss: sys.exit(f"STOP: GloFAS history has no value for {miss[0].date()} (history covers June to October only).")
    q = np.array([series[x] for x in days]); r = rise_from_flow(q, L["mean"][i, j], L["rl2"][i, j], L["rl5"][i, j], L["rl20"][i, j])
    return days, q, r, {"river_cell_lat": float(la[i]), "river_cell_lon": float(lo[j]), "distance_km": round(float(d[i, j]), 1), "mean_flow_m3s": float(L["mean"][i, j])}

def stage_from_csv(path):
    import pandas as pd
    df = pd.read_csv(path); df.columns = [c.strip().lower() for c in df.columns]
    return [pd.Timestamp(x).normalize() for x in df["date"]], None, df["rise_m"].to_numpy(float), {"source": str(path)}

# ---------- scoring ----------
def auc(score, truth):
    from scipy.stats import rankdata
    n1 = int(truth.sum()); n0 = truth.size - n1
    if n1 == 0 or n0 == 0: return float("nan")
    r = rankdata(score); return float((r[truth].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

def iou(pred, truth):
    tp = int((pred & truth).sum()); fp = int((pred & ~truth).sum()); fn = int((~pred & truth).sum())
    return {"iou": tp / max(tp + fp + fn, 1), "precision": tp / max(tp + fp, 1), "recall": tp / max(tp + fn, 1), "predicted_cells": int(pred.sum())}

def score(depth, hand, rise_obs, truth, valid):
    t = truth[valid]; d = depth[valid]; h = hand[valid]
    phys = d >= 0.1; hp = h <= rise_obs
    k = int(phys.sum()); m = np.zeros_like(hp)
    if k > 0: m[np.argsort(h, kind="stable")[:k]] = True
    return {"truth_cells": int(t.sum()), "valid_cells": int(t.size), "base_rate": float(t.mean()),
            "physics": {**iou(phys, t), "auc": auc(d, t)}, "terrain_whatif_same_rise": {**iou(hp, t), "auc": auc(-h, t)}, "terrain_whatif_matched_area": iou(m, t)}

def run_event(ev, dems, a, args, ch_fine, tr, crs, lat, plot_dir):
    import pandas as pd
    obs_date = pd.Timestamp(ev["obs_date"]).normalize(); start = pd.Timestamp(ev.get("start") or (obs_date - timedelta(days=10))).normalize()
    if ev.get("stage_csv"): days, q, rise, info = stage_from_csv(ev["stage_csv"])
    else: days, q, rise, info = stage_from_glofas(args.lon, args.lat, start.to_pydatetime(), obs_date.to_pydatetime())
    if np.isnan(rise).any(): return {"name": ev["name"], "skipped": "river levels could not be derived (flow levels missing or not increasing)"}
    t_days = np.array([(x - days[0]).days for x in days], float); stage = lambda t: float(np.interp(t / 86400.0, t_days, rise))
    t_obs = ((obs_date - days[0]).days + 0.5) * 86400.0; t_end = min(t_obs, (len(days) - 1) * 86400.0 + 43200.0)
    k = args.coarsen; tru_f, tru_v = observed_on_grid(ev["observed"], tr, a["raw"].shape, crs, k)
    out = {"name": ev["name"], "obs_date": str(obs_date.date()), "river_rise_at_obs_m": round(stage(t_obs), 2), "peak_rise_m": round(float(np.nanmax(rise)), 2), "flow_info": info, "dem": {}}
    for tag, z_fine in dems.items():
        z = block(z_fine, k, "mean"); zmin = block(z_fine, k, "min"); ch = block(ch_fine.astype("float32"), k, "max") > 0
        bad = ~np.isfinite(z); zf = np.where(bad, np.nanmax(z) + 50.0, z); zf = np.where(ch & ~bad, np.where(np.isfinite(zmin), zmin, zf), zf)
        dx, dy = cell_size_m(tr, crs, lat); dx, dy = dx * k, dy * k
        s = Solver(zf, dx, dy, n=args.manning, dt_max=args.dt_max); s.set_forced_level(ch, zf + stage(0.0))
        t0 = time.time(); steps = 0
        while s.t < t_end - 1e-9:
            s.forced_eta = zf + stage(s.t); s.step(min(s._dt(), t_end - s.t)); steps += 1
        from scipy import ndimage
        idx = ndimage.distance_transform_edt(~ch, return_indices=True, return_distances=False); hand = zf - zf[idx[0], idx[1]]
        valid = (tru_v >= 0.5) & ~bad & ~ndimage.binary_dilation(ch, iterations=1); truth = tru_f >= 0.5
        sc = score(s.h, hand, stage(t_obs), truth, valid) if truth[valid].any() else {"skipped": "no observed flood inside the valid window"}
        sc["mass_error"] = float(s.mass_error()); sc["steps"] = steps; sc["seconds"] = round(time.time() - t0, 1); out["dem"][tag] = sc
        print(f"  {ev['name']} {tag}: steps {steps}, {sc['seconds']} s, mass error {sc['mass_error']:.1e}" + (f", physics IoU {sc['physics']['iou']:.3f} vs terrain what-if {sc['terrain_whatif_same_rise']['iou']:.3f}" if "physics" in sc else ""))
        if plot_dir is not None and "physics" in sc: draw(plot_dir / f"{ev['name']}_{tag}.png", ev["name"] + " " + tag, truth, valid, s.h >= 0.1, hand <= stage(t_obs), ch)
    return out

def draw(path, title, truth, valid, phys, hand, ch):
    try:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    except Exception: return
    path.parent.mkdir(parents=True, exist_ok=True); fig, ax = plt.subplots(1, 3, figsize=(13, 4.4))
    for a_, p, name in zip(ax, (truth, phys, hand), ("Observed flood (satellite)", "Physics model", "Terrain what-if (same river rise)")):
        img = np.zeros(truth.shape + (3,)); img[...] = 0.12; img[~valid] = 0.3; img[p & valid] = (0.2, 0.55, 0.95); img[ch] = (1, 1, 1); a_.imshow(img); a_.set_title(name, fontsize=10); a_.axis("off")
    fig.suptitle(title + " (grey = no data, white = river cells held at the river level)", fontsize=9); fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)

def gate(results):
    """Wins on an event = physics IoU is higher than the terrain what-if at the same river rise AND higher than the terrain what-if forced to the same flooded area.
    (ROC-AUC is reported but not used here: the physics depth has many exact zeros, so its AUC is not comparable with the terrain height.)"""
    scored = []
    for r in results:
        d = (r.get("dem") or {}).get("corrected") or {}
        if "physics" in d: scored.append((r["name"], d["physics"]["iou"] - d["terrain_whatif_same_rise"]["iou"], d["physics"]["iou"] - d["terrain_whatif_matched_area"]["iou"]))
    n = len(scored); wins = [s for s in scored if s[1] > 0 and s[2] > 0]; need = math.ceil(2 * n / 3) if n else 0
    mean_gain = float(np.mean([s[2] for s in scored])) if n else float("nan")
    passed = bool(n >= 3 and len(wins) >= need and mean_gain > 0)
    return {"passed": passed, "label": "Pilot. A what-if with water movement over time, checked against satellite floods on a small window. Not a forecast.", "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "rule": "Passes only if at least 3 observed events were scored on the corrected DEM, the physics model has a higher IoU than the terrain what-if both at the same river rise and at the same flooded area in at least two thirds of them, and the mean IoU gain at the same area is above 0.",
            "events_scored": n, "events_won": len(wins), "mean_iou_gain_same_area": None if n == 0 else mean_gain, "per_event": [{"name": s[0], "iou_gain_same_rise": s[1], "iou_gain_same_area": s[2]} for s in scored],
            "reason": None if passed else ("fewer than 3 scored events" if n < 3 else "the physics model did not beat the terrain what-if by the rule")}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--center", required=True, help="lon,lat of the window centre"); ap.add_argument("--half-km", type=float, default=12.0)
    ap.add_argument("--coarsen", type=int, default=3); ap.add_argument("--raw", default=str(ROOT / "data/final/corrected_rasters/raw_dem_2022.tif")); ap.add_argument("--corrected", default=str(ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif"))
    ap.add_argument("--channel", required=True); ap.add_argument("--events", required=True); ap.add_argument("--manning", type=float, default=0.05); ap.add_argument("--dt-max", type=float, default=30.0)
    ap.add_argument("--out", default=str(OUT)); ap.add_argument("--no-plots", action="store_true"); args = ap.parse_args()
    args.lon, args.lat = [float(x) for x in args.center.split(",")]; out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    events = json.loads(Path(args.events).read_text(encoding="utf-8")); print(f"window {args.half_km} km half-size around {args.lon}, {args.lat}; coarsen x{args.coarsen}; {len(events)} events")
    zr, tr, crs = read_window(args.raw, args.lon, args.lat, args.half_km); zc, tr2, _ = read_window(args.corrected, args.lon, args.lat, args.half_km)
    if zr.shape != zc.shape or abs(tr.c - tr2.c) > 1e-9: sys.exit("STOP: raw and corrected DEM windows do not line up (different grids).")
    ch = channel_mask(args.channel, tr, zr.shape, crs); print(f"fine grid {zr.shape}; river cells {int(ch.sum())}")
    if ch.sum() == 0: sys.exit("STOP: no river cells inside the window. Move the centre or check --channel.")
    dx, dy = cell_size_m(tr, crs, args.lat); print(f"cell {dx:.1f} x {dy:.1f} m, model cell {dx*args.coarsen:.0f} x {dy*args.coarsen:.0f} m")
    results = [run_event(ev, {"raw": zr, "corrected": zc}, {"raw": zr}, args, ch, tr, crs, args.lat, None if args.no_plots else out / "figs") for ev in events]
    g = gate(results)
    (out / "pilot_result.json").write_text(json.dumps({"built_utc": g["built_utc"], "window": {"center_lon": args.lon, "center_lat": args.lat, "half_km": args.half_km, "model_cell_m": [round(dx * args.coarsen), round(dy * args.coarsen)]},
        "assumptions": ["River cells are held at a level that rises above the local ground by the planning-assumption rise for the day (GloFAS flow level to 0/1/2/4 m).", f"Manning n = {args.manning} everywhere.", "No bridges, embankments, drains or rainfall are modelled.", "Satellite flood scenes are snapshots: the model is compared on the day of the scene."], "events": results}, indent=1), encoding="utf-8")
    (out / "physics_gate.json").write_text(json.dumps(g, indent=1), encoding="utf-8")
    print("\nGATE:", "PASSED" if g["passed"] else "not passed", "-", g.get("reason") or "", f"({g['events_won']} of {g['events_scored']} events won)")
    print(f"Wrote {out/'pilot_result.json'} and {out/'physics_gate.json'}")

if __name__ == "__main__": main()
