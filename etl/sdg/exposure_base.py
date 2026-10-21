"""Base exposure grids on the WorldPop 3-arcsec grid (~90 m) for the analysis box 81.9-84.0 E x 25.4-28.0 N.
Layers: district_id, pop_2020, cropland_frac (WorldCover 40), builtup_frac (50), bldg_count (VIDA, counted once by centre).
Writes ONLY to data/processed/sdg/exposure_base/. Population is a 2020 snapshot; land cover is 2021."""
import sys, os, glob, re, time
import numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
EXT = ROOT + "data/external/"; OUT = ROOT + "data/processed/sdg/exposure_base/"
os.makedirs(OUT, exist_ok=True)
W, S, E, N = 81.9, 25.4, 84.0, 28.0
PX = 1 / 1200
COLS, ROWS = int(round((E - W) / PX)), int(round((N - S) / PX))
TR = from_origin(W, N, PX, PX)
lat_c = N - (np.arange(ROWS) + 0.5) * PX
cell_km2 = (PX * 111.32 * np.cos(np.radians(lat_c))) * (PX * 110.95)
area_grid = np.repeat(cell_km2[:, None], COLS, axis=1)
t0 = time.time()
def stamp(msg): print(f"[{(time.time()-t0)/60:5.1f} min] {msg}", flush=True)

def save(name, arr, dtype, nodata=None):
    with rasterio.open(OUT + name, "w", driver="GTiff", height=ROWS, width=COLS, count=1, dtype=dtype, crs="EPSG:4326",
                       transform=TR, nodata=nodata, compress="lzw", tiled=True, blockxsize=256, blockysize=256) as d:
        d.write(arr.astype(dtype), 1)

# 1. districts
g = gpd.read_file(ROOT + "data/processed/sdg/districts/districts_in_box.geojson").reset_index(drop=True)
g["did"] = g.index + 1
dist = rasterize(((geom, int(i)) for geom, i in zip(g.geometry, g.did)), out_shape=(ROWS, COLS), transform=TR, fill=0, dtype="uint16")
save("district_id.tif", dist, "uint16", 0)
g.drop(columns="geometry").to_csv(OUT + "districts_table.csv", index=False)
iso_of = np.array([0] + [1 if v == "IND" else 2 for v in g["iso"]])
cn = iso_of[dist]
stamp(f"grid {COLS} x {ROWS} cells | districts {len(g)} | cells inside districts {(dist>0).sum():,}")

# 2. population (India raster for Indian districts, Nepal raster for Nepali districts)
def pop_window(path):
    with rasterio.open(path) as s:
        T = s.transform
        assert abs(T.a - PX) < 1e-9, "population pixel size is not 3 arcsec"
        fc, fr = ((W - T.c) / T.a) % 1, ((T.f - N) / (-T.e)) % 1
        print(f"  {os.path.basename(path)}: grid offset vs box grid = {fc:.3f} / {fr:.3f} of a cell (0 = aligned); resampling = sum", flush=True)
        dst = np.full((ROWS, COLS), np.nan, dtype="float32")
        reproject(source=rasterio.band(s, 1), destination=dst, dst_transform=TR, dst_crs="EPSG:4326",
                  src_nodata=s.nodata, dst_nodata=np.nan, resampling=Resampling.sum)
        dst[dst < 0] = np.nan
        c0, r0 = int(round((W - T.c) / T.a)), int(round((T.f - N) / (-T.e)))
        raw = s.read(1, window=Window(c0, r0, COLS, ROWS), boundless=True, fill_value=s.nodata).astype("float64")
        raw[(raw == s.nodata) | (raw < 0)] = 0
        print(f"  people in window: raw cells {raw.sum():,.0f} | resampled {np.nansum(dst):,.0f}", flush=True)
    return dst
pop = np.where(cn == 1, pop_window(EXT + "population/worldpop/ind_pop_2020_CN_100m_R2024B_v1.tif"),
               np.where(cn == 2, pop_window(EXT + "population/worldpop/npl_pop_2020_CN_100m_R2024B_v1.tif"), np.nan)).astype("float32")
save("pop_2020.tif", np.where(np.isfinite(pop), pop, -9999), "float32", -9999)
stamp(f"population saved | people inside the districts-in-box: {np.nansum(pop):,.0f}")

# 3. land cover fractions (10 m -> 10 x 10 blocks per cell)
crop = np.zeros((ROWS, COLS), "float32"); built = np.zeros((ROWS, COLS), "float32")
for fn, lat0, lon0 in (("ESA_WorldCover_10m_2021_v200_N24E081_Map.tif", 24, 81), ("ESA_WorldCover_10m_2021_v200_N27E081_Map.tif", 27, 81)):
    top = lat0 + 3
    r_start, r_end = max(0, int(round((N - top) * 1200))), min(ROWS, int(round((N - lat0) * 1200)))
    with rasterio.open(EXT + "landcover/worldcover/" + fn) as s:
        assert s.width == 36000, "unexpected WorldCover tile size"
        for rs in range(r_start, r_end, 300):
            re_ = min(rs + 300, r_end)
            wr0 = int(round((top - (N - rs * PX)) * 12000))
            wc0 = int(round((W - lon0) * 12000))
            a = s.read(1, window=Window(wc0, wr0, COLS * 10, (re_ - rs) * 10))
            crop[rs:re_] = (a == 40).reshape(re_ - rs, 10, COLS, 10).mean(axis=(1, 3))
            built[rs:re_] = (a == 50).reshape(re_ - rs, 10, COLS, 10).mean(axis=(1, 3))
save("cropland_frac.tif", crop, "float32"); save("builtup_frac.tif", built, "float32")
stamp(f"land cover saved | cropland inside districts: {(crop*area_grid*100*(dist>0)).sum():,.0f} ha")

# 4. buildings (VIDA): count by centre of bounding box; a building belongs to the file whose 0.25-degree square holds its centre
files = sorted(glob.glob(EXT + "buildings/vida/buildings_*.parquet"))
pat = re.compile(r"buildings_([\d.]+)_([\d.]+)\.parquet")
bc = np.zeros(ROWS * COLS, dtype="int64"); rows_read = 0
for i, p in enumerate(files):
    fw, fs = (float(x) for x in pat.search(os.path.basename(p)).groups())
    d = pd.read_parquet(p, columns=["xmin", "ymin", "xmax", "ymax"])
    cx, cy = (d.xmin.values + d.xmax.values) / 2, (d.ymin.values + d.ymax.values) / 2
    if len(cx):
        assert 60 < cx.min() and cx.max() < 100 and 5 < cy.min() and cy.max() < 40, f"{os.path.basename(p)}: bbox columns are not lon/lat degrees"
    rows_read += len(cx)
    own = (cx >= fw) & (cx < fw + 0.25) & (cy >= fs) & (cy < fs + 0.25) & (cx >= W) & (cx < E) & (cy >= S) & (cy < N)
    col = np.clip(((cx[own] - W) / PX).astype(int), 0, COLS - 1); row = np.clip(((N - cy[own]) / PX).astype(int), 0, ROWS - 1)
    bc += np.bincount(row * COLS + col, minlength=ROWS * COLS)
    if (i + 1) % 40 == 0: stamp(f"buildings: {i+1}/{len(files)} files")
bc = bc.reshape(ROWS, COLS)
save("bldg_count.tif", np.minimum(bc, 65535), "uint16")
stamp(f"buildings saved | rows read {rows_read:,} | counted once inside box {bc.sum():,}")

# 5. per-district totals (sanity check)
ids = dist.ravel().astype(int); nd = len(g) + 1
zs = lambda a: np.bincount(ids, weights=np.nan_to_num(a.ravel().astype("float64")), minlength=nd)
t = g.drop(columns="geometry").copy()
t["raster_area_km2"] = zs(area_grid)[1:]; t["pop_2020"] = zs(pop)[1:]
t["cropland_ha"] = zs(crop * area_grid * 100)[1:]; t["builtup_ha"] = zs(built * area_grid * 100)[1:]; t["buildings"] = zs(bc)[1:]
t.to_csv(OUT + "exposure_base_by_district.csv", index=False)
pd.set_option("display.width", 220); pd.set_option("display.max_rows", 100)
print(t[["iso", "shapeName", "share_in_box", "area_km2_in_box", "raster_area_km2", "pop_2020", "cropland_ha", "buildings"]].round(2).to_string(index=False))
print("\nTOTALS by country:"); print(t.groupby("iso")[["area_km2_in_box", "pop_2020", "cropland_ha", "builtup_ha", "buildings"]].sum().round(0).to_string())
stamp("done -> " + OUT)
