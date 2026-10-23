"""Synthetic checks for slope and the slope raster builder.  uv run python -I etl/landslide/test_slope.py"""
import sys, tempfile, math
from pathlib import Path
import numpy as np, rasterio
from rasterio.transform import from_origin
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from slope_tools import horn_slope, cell_m
from build_slope import build
ok = []
def t(n, v, d=""): ok.append(bool(v)); print(("PASS  " if v else "FAIL  ") + n + (f"   {d}" if d else ""))
cy, cx = np.mgrid[0:60, 0:60]; z = 30.0 * math.tan(math.radians(30)) * cx   # a plane rising 30 degrees to the east, 30 m cells
s = horn_slope(z, 30.0, 30.0); t("30 degree plane reads 30 degrees", abs(np.nanmedian(s) - 30) < 0.01, f"{np.nanmedian(s):.3f}")
t("flat ground reads 0", np.nanmax(horn_slope(np.full((20, 20), 100.0), 30.0, 30.0)) < 1e-9)
z2 = 30.0 * math.tan(math.radians(20)) * cy; t("20 degree slope towards south reads 20", abs(np.nanmedian(horn_slope(z2, 30.0, 30.0)) - 20) < 0.01)
zn = horn_slope(np.where((cx == 30) & (cy == 30), np.nan, z), 30., 30.); t("a no-data cell and its 8 neighbours are no data, cells 2 away are fine", np.isnan(zn[29:32, 29:32]).all() and np.isfinite(zn[27, 27]) and np.isfinite(zn[33, 30]))
tmp = Path(tempfile.mkdtemp()); res = 1 / 3600
zz = np.tile(np.arange(300) * 1.0, (200, 1)).astype("float32"); zz[10:20, 10:20] = np.nan
with rasterio.open(tmp / "d.tif", "w", driver="GTiff", height=200, width=300, count=1, dtype="float32", crs="EPSG:4326", transform=from_origin(82.0, 27.5, res, res), nodata=np.nan) as d: d.write(zz, 1)
build(tmp / "d.tif", tmp / "s.tif", strip=64)
with rasterio.open(tmp / "s.tif") as r: a = r.read(1)
exp = math.degrees(math.atan(1.0 / (res * 111320 * math.cos(math.radians(27.4)))))
t("strip-wise raster matches the expected slope", abs(float(np.median(a[100:180, 100:280])) - round(exp)) <= 1, f"median {np.median(a[100:180,100:280])} expected {exp:.2f}")
t("no-data holes are 255", (a[12:18, 12:18] == 255).all())
t("no seam between strips", np.ptp(a[100:180, 100:280]) <= 1)
sys.exit(0 if all(ok) else 1)
