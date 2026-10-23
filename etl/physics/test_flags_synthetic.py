"""Synthetic test of the --flags option of make_event_masks.py (patch 14c): the 2023-09-10 scene carries the advisory flag, the others do not.  uv run python -I etl/physics/test_flags_synthetic.py"""
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
    tif(g / f"t/f{i}.tif", fl); rows.append({"id": f"i{i}", "datetime": d + "T12:00:00Z", "tile": "E030N300T3", "flood_extent": f"t/f{i}.tif", "exclusion_mask": "t/excl.tif", "reference_water": "t/ref.tif", "anomaly_detected": "True" if d == "2023-09-10" else "False"})
pd.DataFrame(rows).to_csv(g / "items.csv", index=False)
o = tmp / "data/external/osm"; o.mkdir()
(o / "osm_82.40_27.40.json").write_text(json.dumps({"elements": [{"type": "way", "id": 1, "tags": {"waterway": "river"}, "geometry": [{"lat": 27.0, "lon": 82.4}, {"lat": 27.4, "lon": 82.7}]}, {"type": "way", "id": 2, "tags": {"waterway": "stream"}, "geometry": [{"lat": 27.1, "lon": 82.4}, {"lat": 27.3, "lon": 82.6}]}]}))
(o / "osm_82.90_27.40.json").write_text(json.dumps({"elements": [{"type": "node", "id": 10, "lat": 27.1, "lon": 82.45}, {"type": "node", "id": 11, "lat": 27.3, "lon": 82.65}, {"type": "way", "id": 3, "tags": {"waterway": "river"}, "nodes": [10, 11]}]}))
def mk(flags, name): return subprocess.run([sys.executable, "-I", "etl/physics/make_event_masks.py", "--center", "82.55,27.2", "--half-km", "10", "--auto", "3", "--flags", flags, "--events-file", name, "--out", "out"], cwd=tmp, capture_output=True, text=True)
ru, rf, ra = mk("unflagged", "ev_unflagged.json"), mk("flagged", "ev_flagged.json"), mk("any", "ev_any.json"); print(ru.stdout[-700:], ru.stderr[-400:])
ld = lambda n: [e["obs_date"] for e in json.loads((tmp / "out" / n).read_text())] if (tmp / "out" / n).exists() else None
u, f, a = ld("ev_unflagged.json"), ld("ev_flagged.json"), ld("ev_any.json")
ck = [("all three runs worked", ru.returncode == 0 and rf.returncode == 0 and ra.returncode == 0), ("unflagged set leaves out the flagged day", u is not None and "2023-09-10" not in u and len(u) >= 1),
      ("flagged set holds only the flagged day", f == ["2023-09-10"]), ("default set keeps the flagged day (old behaviour)", a is not None and "2023-09-10" in a),
      ("events.json (first set) is not touched by the other names", not (tmp / "out/events.json").exists())]
for nm, ok in ck: print(("PASS  " if ok else "FAIL  ") + nm)
sys.exit(0 if all(ok for _, ok in ck) else 1)
