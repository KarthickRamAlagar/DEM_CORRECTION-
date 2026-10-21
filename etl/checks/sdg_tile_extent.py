import sys, glob
import numpy as np, rasterio
from pyproj import Transformer
sys.stdout.reconfigure(encoding="utf-8")
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/processed/sdg/flood_annual/unflagged/"
allx, ally = [], []
for p in sorted(glob.glob(base + "flood_nscenes_2019_*.tif")):
    with rasterio.open(p) as s:
        b = s.bounds; tr = Transformer.from_crs(s.crs, "EPSG:4326", always_xy=True)
        xs = np.linspace(b.left, b.right, 25); ys = np.linspace(b.bottom, b.top, 25)
        gx, gy = np.meshgrid(xs, ys); lon, lat = tr.transform(gx.ravel(), gy.ravel())
        print(p.split("2019_")[-1], "| lon", round(lon.min(), 2), "to", round(lon.max(), 2), "| lat", round(lat.min(), 2), "to", round(lat.max(), 2))
        allx += [lon.min(), lon.max()]; ally += [lat.min(), lat.max()]
print("all tiles together: lon", round(min(allx), 2), "to", round(max(allx), 2), "| lat", round(min(ally), 2), "to", round(max(ally), 2))
