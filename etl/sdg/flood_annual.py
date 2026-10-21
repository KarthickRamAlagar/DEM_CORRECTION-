"""B1: per tile and year, number of scenes that mapped each 100 m pixel as flooded (GFM), valid = flood==1 & exclusion==0 & refwater!=1.
--view unflagged (main) or flagged (sensitivity). Writes small GeoTIFFs; resumes by year. Only items with flooded_pixels>0 are read."""
import sys, os, time, argparse
from functools import lru_cache
import numpy as np, pandas as pd, rasterio
from rasterio import Affine
from rasterio.enums import Resampling

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
GFM = ROOT + "data/external/flood_observed/gfm/"
DEC = 5
ap = argparse.ArgumentParser()
ap.add_argument("--view", choices=["unflagged", "flagged"], default="unflagged")
ap.add_argument("--limit", type=int, default=0, help="test: first N items only, writes to flood_annual_test/")
a = ap.parse_args()
OUT = ROOT + ("data/processed/sdg/flood_annual_test/" if a.limit else "data/processed/sdg/flood_annual/") + a.view + "/"
os.makedirs(OUT, exist_ok=True)

df = pd.read_csv(GFM + "items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df["day"] = df["datetime"].dt.strftime("%Y-%m-%d"); df["year"] = df["datetime"].dt.year
df["flag"] = df["anomaly_detected"].astype(str)
df["flooded_pixels"] = pd.to_numeric(df["flooded_pixels"], errors="coerce")
want = "False" if a.view == "unflagged" else "True"
sel = df[(df["flag"] == want) & (df["flooded_pixels"] > 0)].sort_values("datetime")
if a.limit: sel = sel.head(a.limit)
print(f"view={a.view} | items with flood to read: {len(sel)} of {len(df)} total | years: {sorted(sel['year'].unique().tolist())}")

def P(rel): return GFM + str(rel).replace("\\", "/")
grid = {}
for tile in df["tile"].unique():
    first = df[df["tile"] == tile].iloc[0]
    with rasterio.open(P(first["flood_extent"])) as s:
        grid[tile] = dict(crs=s.crs, tr=s.transform * Affine.scale(DEC, DEC), shape=(s.height // DEC, s.width // DEC))

def rd(path, shape):
    with rasterio.open(path) as s:
        return s.read(1, out_shape=shape, resampling=Resampling.nearest)
@lru_cache(maxsize=6)
def refwater(path, shape): return rd(path, shape)

def outfile(year, tile): return OUT + f"flood_nscenes_{year}_{tile}.tif"
t0, done, errs, total_bytes = time.time(), 0, 0, 0
for year, yd in sel.groupby("year"):
    if not a.limit and all(os.path.exists(outfile(year, t)) for t in grid):
        print(year, "already done - skipped"); done += len(yd); continue
    acc = {t: np.zeros(g["shape"], dtype="uint16") for t, g in grid.items()}
    for _, it in yd.iterrows():
        done += 1
        sh = grid[it["tile"]]["shape"]
        try:
            f = rd(P(it["flood_extent"]), sh); e = rd(P(it["exclusion_mask"]), sh); w = refwater(P(it["reference_water"]), sh)
        except Exception as ex:
            errs += 1; print("  skip", it["id"], type(ex).__name__); continue
        acc[it["tile"]] += ((f == 1) & (e == 0) & (w != 1)).astype("uint16")
        if done % 100 == 0:
            el = time.time() - t0; print(f"{done}/{len(sel)} items | {el/60:.1f} min | ETA {(el/done)*(len(sel)-done)/60:.0f} min | skipped {errs}", flush=True)
    km2 = 0.0
    for t, g in grid.items():
        arr = np.minimum(acc[t], 255).astype("uint8")
        with rasterio.open(outfile(year, t), "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype="uint8",
                           crs=g["crs"], transform=g["tr"], compress="lzw", tiled=True, blockxsize=256, blockysize=256) as dst:
            dst.write(arr, 1)
        total_bytes += os.path.getsize(outfile(year, t)); km2 += float((arr > 0).sum()) * 0.01
    print(f"year {year}: items {len(yd)} | flooded area (any scene, all 4 tiles, before district clip): {km2:,.0f} km2", flush=True)
print(f"\nfinished | items read {done} | skipped {errs} | output size {total_bytes/1e6:.1f} MB | {(time.time()-t0)/60:.1f} min -> {OUT}")
