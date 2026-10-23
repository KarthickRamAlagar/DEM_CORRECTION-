"""Patch 14b, step 1: river lines from the OSM tiles on disk -> a 0/1 raster for the pilot window (the cells held at the river level).  Reads only; writes a small GeoTIFF.
  uv run python -I etl/physics/make_channel_raster.py --center 82.55,27.20 --half-km 14 --classes river --out data/processed/sdg/physics/channel.tif
Reads data/external/osm/osm_*.json (Overpass JSON: ways with geometry, or nodes + ways with node lists). --classes: waterway values to use (default river; add stream to include streams).
The grid is the DEM grid (1 arc-second), so it lines up with the DEM windows used by run_pilot.py."""
import argparse, json, math, sys
from pathlib import Path
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]

def ways_from(path, classes):
    d = json.loads(Path(path).read_text(encoding="utf-8")); els = d.get("elements", []) if isinstance(d, dict) else d
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in els if e.get("type") == "node" and "lat" in e}
    out, seen = [], {}
    for e in els:
        if e.get("type") != "way": continue
        tags = e.get("tags") or {}; wt = tags.get("waterway"); seen[wt] = seen.get(wt, 0) + 1
        if wt not in classes: continue
        if e.get("geometry"): pts = [(g["lon"], g["lat"]) for g in e["geometry"]]
        else: pts = [nodes[n] for n in e.get("nodes", []) if n in nodes]
        if len(pts) >= 2: out.append(pts)
    return out, seen

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--center", required=True); ap.add_argument("--half-km", type=float, default=14.0); ap.add_argument("--classes", default="river")
    ap.add_argument("--osm", default=str(ROOT / "data/external/osm")); ap.add_argument("--out", default=str(ROOT / "data/processed/sdg/physics/channel.tif")); a = ap.parse_args()
    import rasterio
    from rasterio import features
    from rasterio.transform import from_origin
    lon, lat = [float(x) for x in a.center.split(",")]; classes = {c.strip() for c in a.classes.split(",")}
    dlat = (a.half_km + 1) / 110.574; dlon = (a.half_km + 1) / (111.32 * math.cos(math.radians(lat))); res = 1 / 3600.0
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat; W, H = int(round((e - w) / res)), int(round((n - s) / res)); tr = from_origin(w, n, res, res)
    lines, seen_all = [], {}
    for f in sorted(Path(a.osm).glob("osm_*.json")):
        try: ways, seen = ways_from(f, classes)
        except Exception as ex: print("  skip", f.name, type(ex).__name__); continue
        for k, v in seen.items(): seen_all[k] = seen_all.get(k, 0) + v
        for pts in ways:
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            if max(xs) >= w and min(xs) <= e and max(ys) >= s and min(ys) <= n: lines.append({"type": "LineString", "coordinates": pts})
    print("waterway types found in the tiles:", dict(sorted(seen_all.items(), key=lambda kv: -kv[1])[:10]), "| lines inside the window:", len(lines))
    if not lines: sys.exit(f"STOP: no {sorted(classes)} lines inside the window. Try --classes river,stream or another centre.")
    m = features.rasterize(((g, 1) for g in lines), out_shape=(H, W), transform=tr, all_touched=True, fill=0, dtype="uint8")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(a.out, "w", driver="GTiff", height=H, width=W, count=1, dtype="uint8", crs="EPSG:4326", transform=tr, compress="deflate") as d: d.write(m, 1)
    print(f"wrote {a.out}: {W} x {H} cells, river cells {int(m.sum())}")

if __name__ == "__main__": main()
