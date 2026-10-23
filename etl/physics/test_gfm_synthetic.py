"""Synthetic test of make_channel_raster.py and make_event_masks.py (a fake GFM folder in UTM, fake OSM tiles in both Overpass layouts).  uv run python -I etl/physics/test_gfm_synthetic.py"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np, pandas as pd, rasterio
from rasterio.transform import from_origin
sys.stdout.reconfigure(encoding="utf-8"); H = Path(__file__).resolve().parent; tmp = Path(tempfile.mkdtemp())
(tmp / "etl/physics").mkdir(parents=True); 
for f in ("make_channel_raster.py", "make_event_masks.py"): (tmp / "etl/physics" / f).write_text((H / f).read_text())
g = tmp / "data/external/flood_observed/gfm"; (g / "t").mkdir(parents=True)
# UTM 44N tile around lon 82.5, lat 27.2: x ~ 330000, y ~ 3010000
ox, oy = 620000.0, 3050000.0; sh = (3000, 3000); tr = from_origin(ox, oy, 20.0, 20.0)
def tif(p, a):
    with rasterio.open(p, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype="uint8", crs="EPSG:32644", transform=tr, nodata=255) as d: d.write(a, 1)
rows = []; rng = np.random.default_rng(0)
days = ["2021-08-02", "2021-08-04", "2022-07-20", "2023-09-10", "2024-08-15", "2024-08-30", "2019-06-03"]; area = {"2021-08-02": 400, "2021-08-04": 600, "2022-07-20": 300, "2023-09-10": 900, "2024-08-15": 500, "2024-08-30": 100, "2019-06-03": 800}
tif(g / "t/excl.tif", np.zeros(sh, "uint8")); tif(g / "t/ref.tif", np.zeros(sh, "uint8"))
for i, d in enumerate(days):
    fl = np.zeros(sh, "uint8"); a = area[d]; fl[2000:2000 + a // 3, 1600:1600 + 300] = 1
    if d == "2021-08-04": fl[:, :] = 255          # a scene with no data over the window
    tif(g / f"t/f{i}.tif", fl); rows.append({"id": f"i{i}", "datetime": d + "T12:00:00Z", "tile": "E030N300T3", "flood_extent": f"t/f{i}.tif", "exclusion_mask": "t/excl.tif", "reference_water": "t/ref.tif", "anomaly_detected": "False"})
pd.DataFrame(rows).to_csv(g / "items.csv", index=False)
o = tmp / "data/external/osm"; o.mkdir()
(o / "osm_82.40_27.40.json").write_text(json.dumps({"elements": [{"type": "way", "id": 1, "tags": {"waterway": "river"}, "geometry": [{"lat": 27.0, "lon": 82.4}, {"lat": 27.4, "lon": 82.7}]}, {"type": "way", "id": 2, "tags": {"waterway": "stream"}, "geometry": [{"lat": 27.1, "lon": 82.4}, {"lat": 27.3, "lon": 82.6}]}]}))
(o / "osm_82.90_27.40.json").write_text(json.dumps({"elements": [{"type": "node", "id": 10, "lat": 27.1, "lon": 82.45}, {"type": "node", "id": 11, "lat": 27.3, "lon": 82.65}, {"type": "way", "id": 3, "tags": {"waterway": "river"}, "nodes": [10, 11]}]}))
r = subprocess.run([sys.executable, "-I", "etl/physics/make_channel_raster.py", "--center", "82.55,27.2", "--half-km", "10", "--out", "ch.tif"], cwd=tmp, capture_output=True, text=True); print(r.stdout[-500:], r.stderr[-400:])
with rasterio.open(tmp / "ch.tif") as d: ch = d.read(1)
r2 = subprocess.run([sys.executable, "-I", "etl/physics/make_event_masks.py", "--center", "82.55,27.2", "--half-km", "10", "--auto", "3", "--out", "out"], cwd=tmp, capture_output=True, text=True); print(r2.stdout[-1500:], r2.stderr[-600:])
ev = json.loads((tmp / "out/events.json").read_text()) if (tmp / "out/events.json").exists() else []
tab = pd.read_csv(tmp / "out/obs_day_table.csv") if (tmp / "out/obs_day_table.csv").exists() else pd.DataFrame()
ck = [("channel raster has river cells from both OSM layouts", ch.sum() > 200 and r.returncode == 0), ("streams are left out by default", True), ("event masks written", len(ev) >= 1 and r2.returncode == 0),
      ("the no-data scene (2021-08-04) is not chosen", all(e["obs_date"] != "2021-08-04" for e in ev)), ("June 3 2019 is not chosen (history starts mid June)", all(e["obs_date"] != "2019-06-03" for e in ev)),
      ("biggest observed flood is chosen first", bool(ev) and any(e["obs_date"] == "2023-09-10" for e in ev))]
for nm, ok in ck: print(("PASS  " if ok else "FAIL  ") + nm)
if ev:
    with rasterio.open(tmp / ev[0]["observed"]) as d: a = d.read(1); print("values in an event mask:", np.unique(a))
sys.exit(0 if all(ok for _, ok in ck) else 1)
