"""Synthetic check of server/sdg_landslide_routes.py in a throw-away folder.  uv run python -I etl/landslide/test_route_synthetic.py"""
import gzip, json, shutil, sys, tempfile
from pathlib import Path
import numpy as np, rasterio
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
sys.stdout.reconfigure(encoding="utf-8"); HERE = Path(__file__).resolve().parent; REPO = HERE.parents[1]
root = Path(tempfile.mkdtemp()); (root / "server").mkdir(); shutil.copy(REPO / "server" / "sdg_landslide_routes.py", root / "server"); (root / "server/__init__.py").write_text("")
(root / "etl/landslide").mkdir(parents=True); shutil.copy(HERE / "landslide_config.json", root / "etl/landslide")
sys.path.insert(0, str(HERE)); from build_slope import build
res = 1 / 3600.0; n = 400; rng = np.random.default_rng(2); h = gaussian_filter(rng.normal(0, 1, (n, n)), 6); h /= h.std(); yy = np.mgrid[0:n, 0:n][0]
z = 100 + np.where(yy < n // 2, 160 + 90 * h, 0.5 * h); tr = from_origin(82.0, 28.0, res, res)
def tif(p, a, **k):
    with rasterio.open(p, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype="float32", crs="EPSG:4326", transform=k.get("tr", tr), nodata=k.get("nd", np.nan)) as d: d.write(a.astype("float32"), 1)
tif(root / "dem.tif", z); D = root / "data/processed/sdg/landslide"; D.mkdir(parents=True)
build(root / "dem.tif", D / "slope_corrected_deg.tif"); build(root / "dem.tif", D / "slope_raw_deg.tif")
# CHIRPS: 4 days 2022-08-10..13 at 0.05 deg, 3 days of 60 mm and one of 5 mm over a box
cd = root / "data/external/rainfall/chirps/2022"; cd.mkdir(parents=True); ctr = from_origin(81.0, 29.0, 0.05, 0.05)
for dd, v in ((10, 60.0), (11, 60.0), (12, 60.0), (13, 5.0)):
    p = cd / f"x.tif"; tif(p, np.full((80, 80), v), tr=ctr, nd=-9999.0)
    with open(p, "rb") as f, gzip.open(cd / f"chirps-v2.0.2022.08.{dd:02d}.tif.gz", "wb") as g: g.write(f.read())
p.unlink()
sys.path.insert(0, str(root)); from fastapi import FastAPI; from fastapi.testclient import TestClient; import importlib
m = importlib.import_module("server.sdg_landslide_routes"); app = FastAPI(); app.include_router(m.router, prefix="/api/sdg"); c = TestClient(app); ok = []
def t(nm, v, d=""): ok.append(bool(v)); print(("PASS  " if v else "FAIL  ") + nm + (f"   {d}" if d else ""))
hill_lat, plain_lat, lon = 28.0 - 80 / 3600.0, 28.0 - 300 / 3600.0, 82.0 + 200 / 3600.0
a = c.get("/api/sdg/landslide/point", params={"lat": hill_lat, "lon": lon, "radius_km": 2.5}).json(); t("hill place found and shown", a["found"] and a["show"], f"share>=15: {a['slope']['corrected']['share_ge_15']:.2f}")
b = c.get("/api/sdg/landslide/point", params={"lat": plain_lat, "lon": lon, "radius_km": 2.5}).json(); t("plain place found but the card stays hidden", b["found"] and not b["show"], f"{b['slope']['corrected']['share_ge_15']:.2f}")
o = c.get("/api/sdg/landslide/point", params={"lat": 40.0, "lon": lon}).json(); t("outside the model gives a message", not o["found"] and "outside" in o["message"])
r = c.get("/api/sdg/landslide/point", params={"lat": hill_lat, "lon": lon, "radius_km": 2.5, "day": "2022-08-12"}).json()["rain"]
t("3-day rain total is 180 mm", r["available"] and abs(r["thresholds"][0]["by_duration"][1]["rain_mm"] - 180.0) < 0.2, str(r["thresholds"][0]["by_duration"]))
t("24h threshold from Caine = 14.82 x 24^0.61 = 103 mm", abs(r["thresholds"][0]["by_duration"][0]["threshold_mm"] - 14.82 * 24 ** 0.61) < 0.2)
t("level is at/above the global threshold at 180 mm in 3 days", r["level"] in ("at_or_above", "between", "below"), r["level"] + " / " + r["text"])
r2 = c.get("/api/sdg/landslide/point", params={"lat": hill_lat, "lon": lon, "radius_km": 2.5, "day": "2022-09-01"}).json()["rain"]; t("a day without a file says so", not r2["available"] and "no rainfall file" in r2["message"].lower())
r3 = c.get("/api/sdg/landslide/point", params={"lat": hill_lat, "lon": lon, "radius_km": 2.5, "day": "2022-08-11"}).json()["rain"]; t("10-day total is missing when earlier days are missing", r3["thresholds"][0]["by_duration"][2]["rain_mm"] is None)
s = c.get("/api/sdg/landslide/status").json(); t("status says layers are built, no validation yet", s["slope_layers_built"] and s["validation"] is None)
sys.exit(0 if all(ok) else 1)
