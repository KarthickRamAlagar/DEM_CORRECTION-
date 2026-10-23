"""Patch 14b, step 2: observed flood rasters (one per day) for the pilot window from the Copernicus GFM scenes on disk, and the events file for run_pilot.py. Reads only.
  uv run python -I etl/physics/make_event_masks.py --center 82.55,27.20 --half-km 14 --auto 6
Uses data/external/flood_observed/gfm/items.csv (columns id, datetime, tile, flood_extent, exclusion_mask, reference_water, anomaly_detected).
A cell counts as observed only where the scene has data, the exclusion mask is 0 and it is not permanent water (the same rule as etl/sdg/flood_eval_counts.py).
Scenes of the same day are merged (flooded if any scene says flooded). Output values: 1 flooded, 0 observed and dry, 255 no data.
--auto N picks up to N days with the most observed flood in the window (June 12 to October 31, 2019-2025 so the GloFAS history covers them; at least --gap days apart) and writes the events file.
Window days with little observed area or little flood are not picked. Nothing is changed outside data/processed/sdg/physics/ ."""
import argparse, json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; GFM = ROOT / "data/external/flood_observed/gfm"; OUT = ROOT / "data/processed/sdg/physics"

def rel(p):
    try: return str(p.relative_to(ROOT)).replace("\\", "/")
    except ValueError: return str(p)

def render(item, tr, shape):
    import rasterio
    from rasterio.warp import reproject, Resampling
    def rd(rel):
        dst = np.full(shape, 255, dtype="uint8")
        with rasterio.open(GFM / str(rel).replace("\\", "/")) as s:
            reproject(rasterio.band(s, 1), dst, dst_transform=tr, dst_crs="EPSG:4326", dst_nodata=255, src_nodata=None, resampling=Resampling.nearest)
        return dst
    f, e, w = rd(item["flood_extent"]), rd(item["exclusion_mask"]), rd(item["reference_water"])
    valid = (f != 255) & (e == 0) & (w != 1); return (f == 1) & valid, valid

def tile_hits(df, lon0, lat0, lon1, lat1):
    import rasterio
    from rasterio.warp import transform_bounds
    keep = []
    for tile, g in df.groupby("tile"):
        try:
            with rasterio.open(GFM / str(g.iloc[0]["flood_extent"]).replace("\\", "/")) as s:
                b = transform_bounds("EPSG:4326", s.crs, lon0, lat0, lon1, lat1); bb = s.bounds
                if b[0] < bb.right and b[2] > bb.left and b[1] < bb.top and b[3] > bb.bottom: keep.append(tile)
        except Exception: continue
    return keep

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--center", required=True); ap.add_argument("--half-km", type=float, default=14.0); ap.add_argument("--auto", type=int, default=0); ap.add_argument("--days", default="")
    ap.add_argument("--gap", type=int, default=7); ap.add_argument("--min-valid", type=float, default=0.6); ap.add_argument("--min-flood", type=float, default=0.005); ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--flags", choices=["any", "unflagged", "flagged"], default="any", help="with --auto: use only days whose scenes all carry no advisory flag (unflagged), or all carry it (flagged)")
    ap.add_argument("--events-file", default="events.json", help="name of the events file written in --out (use another name to keep the first set)"); a = ap.parse_args()
    import rasterio
    from rasterio.transform import from_origin
    lon, lat = [float(x) for x in a.center.split(",")]; km = a.half_km + 1; dlat = km / 110.574; dlon = km / (111.32 * math.cos(math.radians(lat))); res = 1 / 3600.0
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat; W, H = int(round((e - w) / res)), int(round((n - s) / res)); tr = from_origin(w, n, res, res)
    df = pd.read_csv(GFM / "items.csv"); df["datetime"] = pd.to_datetime(df["datetime"], utc=True); df["day"] = df["datetime"].dt.strftime("%Y-%m-%d"); df["flag"] = df["anomaly_detected"].astype(str)
    tiles = tile_hits(df, w, s, e, n); df = df[df["tile"].isin(tiles)]; print(f"scene items on tiles that touch the window: {len(df)} ({len(tiles)} tiles)")
    if df.empty: sys.exit("STOP: no scene tile touches this window.")
    want = {d.strip() for d in a.days.split(",") if d.strip()}; rows = []
    cand_days = sorted(df["day"].unique()); out = Path(a.out).resolve(); (out / "obs").mkdir(parents=True, exist_ok=True)
    for i, day in enumerate(cand_days):
        y, m, dd = int(day[:4]), int(day[5:7]), int(day[8:])
        if want and day not in want: continue
        if not want and not (2019 <= y <= 2025 and ((m == 6 and dd >= 12) or 7 <= m <= 9 or (m == 10))): continue
        fl = np.zeros((H, W), bool); va = np.zeros((H, W), bool); flags = set(); k = 0
        for _, it in df[df["day"] == day].iterrows():
            try: f_, v_ = render(it, tr, (H, W))
            except Exception as ex: continue
            if v_.any(): fl |= f_; va |= v_; flags.add(it["flag"]); k += 1
        if k == 0: continue
        rows.append({"unflagged": all(f.strip().lower() in ("false", "0", "0.0", "", "nan", "none") for f in flags), "day": day, "scenes": k, "valid_frac": float(va.mean()), "flood_cells": int(fl.sum()), "flood_frac": float(fl.sum() / max(va.sum(), 1)), "flags": ",".join(sorted(flags)), "_fl": fl, "_va": va})
        if (i + 1) % 40 == 0: print(f"  scanned {i+1}/{len(cand_days)} days", flush=True)
    if not rows: sys.exit("STOP: no usable scenes in the window.")
    tab = pd.DataFrame([{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]); tab.to_csv(out / "obs_day_table.csv", index=False)
    chosen = []
    if want: chosen = [r for r in rows]
    else:
        ok = [r for r in rows if r["valid_frac"] >= a.min_valid and r["flood_frac"] >= a.min_flood and r["flood_cells"] >= 300 and (a.flags == "any" or (r["unflagged"] if a.flags == "unflagged" else not r["unflagged"]))]
        for r in sorted(ok, key=lambda r: -r["flood_cells"]):
            if all(abs((pd.Timestamp(r["day"]) - pd.Timestamp(c["day"])).days) >= a.gap for c in chosen): chosen.append(r)
            if len(chosen) >= a.auto: break
    print(f"days with data: {len(rows)}; chosen: {len(chosen)}")
    events = []
    for r in sorted(chosen, key=lambda r: r["day"]):
        a8 = np.full((H, W), 255, "uint8"); a8[r["_va"]] = 0; a8[r["_fl"]] = 1; p = out / "obs" / f"{r['day']}.tif"
        with rasterio.open(p, "w", driver="GTiff", height=H, width=W, count=1, dtype="uint8", crs="EPSG:4326", transform=tr, nodata=255, compress="deflate") as d: d.write(a8, 1)
        events.append({"name": f"event_{r['day']}", "obs_date": r["day"], "observed": rel(p)}); print(f"  {r['day']}: flooded cells {r['flood_cells']:,} ({r['flood_frac']*100:.1f}% of observed), observed share of window {r['valid_frac']*100:.0f}%, flags {r['flags']}")
    (out / a.events_file).write_text(json.dumps(events, indent=1), encoding="utf-8"); print(f"wrote {out/a.events_file} with {len(events)} events and obs_day_table.csv")
    if len(events) < 3: print("NOTE: fewer than 3 events. The gate needs at least 3. Lower --min-flood or --gap, or try another window.")

if __name__ == "__main__": main()
