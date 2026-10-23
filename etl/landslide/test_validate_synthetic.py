"""Synthetic end-to-end test of build_slope + validate_glc: hills in the north half, plains in the south; landslide points placed on the steep ground.  uv run python -I etl/landslide/test_validate_synthetic.py"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np, pandas as pd, rasterio
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
sys.stdout.reconfigure(encoding="utf-8"); H = Path(__file__).resolve().parent; tmp = Path(tempfile.mkdtemp())
res = 1 / 360.0; n = 600; lon0, lat0 = 82.0, 28.0; rng = np.random.default_rng(5)
yy, xx = np.mgrid[0:n, 0:n]; hills = gaussian_filter(rng.normal(0, 1, (n, n)), 8); hills = hills / hills.std()
z = 100 + np.where(yy < n // 2, 160 + 90 * hills, 0.6 * hills)      # north half: hills 160 +- 90 m above 100; south: plain
zr = z + 2 * gaussian_filter(rng.normal(0, 1, (n, n)), 3)
tr = from_origin(lon0, lat0, res, res)
def tif(p, a):
    with rasterio.open(p, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32", crs="EPSG:4326", transform=tr, nodata=np.nan) as d: d.write(a.astype("float32"), 1)
tif(tmp / "cor.tif", z); tif(tmp / "raw.tif", zr)
r = subprocess.run([sys.executable, "-I", str(H / "build_slope.py"), "--raw", str(tmp / "raw.tif"), "--corrected", str(tmp / "cor.tif"), "--out", str(tmp / "o")], capture_output=True, text=True); print(r.stdout[-300:], r.stderr[-500:])
with rasterio.open(tmp / "o/slope_corrected_deg.tif") as s: sl = s.read(1).astype(float)
cand = np.argwhere((yy < n // 2 - 20) & (sl > np.percentile(sl[: n // 2], 75)) & (sl < 255)); pick = cand[rng.choice(len(cand), 80, replace=False)]
lons = lon0 + (pick[:, 1] + .5) * res; lats = lat0 - (pick[:, 0] + .5) * res
pd.DataFrame({"event_date": "2012-08-01", "location_accuracy": ["1km"] * 80, "latitude": lats, "longitude": lons}).to_csv(tmp / "glc.csv", index=False)
r = subprocess.run([sys.executable, "-I", str(H / "validate_glc.py"), "--glc", str(tmp / "glc.csv"), "--slope-raw", str(tmp / "o/slope_raw_deg.tif"), "--slope-corrected", str(tmp / "o/slope_corrected_deg.tif"),
                    "--dem", str(tmp / "cor.tif"), "--out", str(tmp / "v.json"), "--hill-elev", "200"], capture_output=True, text=True); print(r.stdout[-900:], r.stderr[-800:])
v = json.loads((tmp / "v.json").read_text()) if (tmp / "v.json").exists() else {}
ck = [("validation ran", bool(v)), ("80 events used", v.get("events_used") == 80), ("slope separates landslide places from random places (all)", v.get("all_places", {}).get("auc_corrected", 0) > 0.7),
      ("within the hills the result is reported with an interval", "auc_corrected_ci95" in v.get("hill_places", {})), ("verdict field exists", "verdict" in v)]
for nme, ok in ck: print(("PASS  " if ok else "FAIL  ") + nme)
# a catalog with random places must NOT be supported
rl = rng.uniform(lon0, lon0 + n * res, 80); ra = rng.uniform(lat0 - n * res, lat0, 80)
pd.DataFrame({"event_date": "2012-08-01", "location_accuracy": ["1km"] * 80, "latitude": ra, "longitude": rl}).to_csv(tmp / "glc2.csv", index=False)
subprocess.run([sys.executable, "-I", str(H / "validate_glc.py"), "--glc", str(tmp / "glc2.csv"), "--slope-raw", str(tmp / "o/slope_raw_deg.tif"), "--slope-corrected", str(tmp / "o/slope_corrected_deg.tif"), "--dem", str(tmp / "cor.tif"), "--out", str(tmp / "v2.json"), "--hill-elev", "200"], capture_output=True, text=True)
v2 = json.loads((tmp / "v2.json").read_text()); ok2 = v2["verdict"]["slope_screen_supported"] is False; print(("PASS  " if ok2 else "FAIL  ") + "random places are not reported as supported", v2["hill_places"].get("auc_corrected"))
sys.exit(0 if all(o for _, o in ck) and ok2 else 1)
