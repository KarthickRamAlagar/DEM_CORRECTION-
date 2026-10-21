"""Yearly flood exposure per district on the 90 m box grid. Bounds: lower = unflagged GFM scenes, upper = unflagged OR flagged.
Counts are annual-maximum extent (flooded in at least one scene that year). Population 2020, land cover 2021. Nepal buildings = no data (VIDA Nepal not fetched)."""
import sys, os, glob, time
import numpy as np, pandas as pd, rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
BASE = ROOT + "data/processed/sdg/exposure_base/"; FL = ROOT + "data/processed/sdg/flood_annual/"; OUT = ROOT + "data/processed/sdg/exposure/"
os.makedirs(OUT, exist_ok=True)
W, S, E, N = 81.9, 25.4, 84.0, 28.0
PX = 1 / 1200; COLS, ROWS = 2520, 3120; TR = from_origin(W, N, PX, PX)
t0 = time.time()

def rd(name):
    with rasterio.open(BASE + name) as s:
        a = s.read(1); return a, s.nodata
dist, _ = rd("district_id.tif")
pop, pnd = rd("pop_2020.tif"); pop = np.where(pop == pnd, 0, pop).astype("float64")
crop, _ = rd("cropland_frac.tif"); built, _ = rd("builtup_frac.tif"); bc, _ = rd("bldg_count.tif")
lat_c = N - (np.arange(ROWS) + 0.5) * PX
area = np.repeat(((PX * 111.32 * np.cos(np.radians(lat_c))) * (PX * 110.95))[:, None], COLS, axis=1)
tab = pd.read_csv(BASE + "districts_table.csv")
assert dist.max() == len(tab), "district table and raster disagree"
ids = dist.ravel().astype(int); nd = len(tab) + 1
zs = lambda a: np.bincount(ids, weights=a.ravel().astype("float64"), minlength=nd)[1:]
tot = dict(km2=zs(area), pop=zs(pop), crop=zs(crop * area * 100), bld=zs(bc.astype("float64")))

def flood_grid(view, year):
    out = np.zeros((ROWS, COLS), "uint8")
    files = glob.glob(FL + f"{view}/flood_nscenes_{year}_*.tif")
    assert files, f"no flood files for {view} {year}"
    for p in files:
        tmp = np.zeros((ROWS, COLS), "uint8")
        with rasterio.open(p) as s:
            reproject(source=rasterio.band(s, 1), destination=tmp, dst_transform=TR, dst_crs="EPSG:4326",
                      resampling=Resampling.nearest, dst_nodata=0)
        out = np.maximum(out, tmp)
    return out > 0

def metrics(fl):
    f = fl.astype("float64")
    return dict(km2=zs(f * area), pop=zs(f * pop), crop=zs(f * crop * area * 100), bld=zs(f * bc))

rows = []; yrs_low = np.zeros((ROWS, COLS), "uint8"); yrs_up = np.zeros((ROWS, COLS), "uint8")
ever_low = np.zeros((ROWS, COLS), bool); ever_up = np.zeros((ROWS, COLS), bool)
def add(year, bound, m):
    d = pd.DataFrame(dict(iso=tab["iso"], district=tab["shapeName"], share_in_box=tab["share_in_box"], year=year, bound=bound,
                          flooded_km2=m["km2"], pop_exposed=m["pop"], cropland_ha_exposed=m["crop"], buildings_exposed=m["bld"],
                          district_area_km2=tot["km2"], district_pop=tot["pop"], district_cropland_ha=tot["crop"], district_buildings=tot["bld"]))
    d.loc[d["iso"] == "NPL", ["buildings_exposed", "district_buildings"]] = np.nan   # VIDA Nepal not fetched = NO DATA
    rows.append(d)
for year in range(2019, 2027):
    fu, ff = flood_grid("unflagged", year), flood_grid("flagged", year)
    up = fu | ff
    add(year, "lower_unflagged", metrics(fu)); add(year, "upper_union", metrics(up))
    yrs_low += fu.astype("uint8"); yrs_up += up.astype("uint8"); ever_low |= fu; ever_up |= up
    print(f"[{(time.time()-t0)/60:4.1f} min] {year}: flooded cells inside districts  lower {int((fu&(dist>0)).sum()):,} | upper {int((up&(dist>0)).sum()):,}", flush=True)
add("2019-2026 ever", "lower_unflagged", metrics(ever_low)); add("2019-2026 ever", "upper_union", metrics(ever_up))
df = pd.concat(rows, ignore_index=True)
for c, d_ in (("pct_area", "district_area_km2"), ("pct_pop", "district_pop"), ("pct_cropland", "district_cropland_ha")):
    df[c] = np.where(df[d_] > 0, 100 * df[{"pct_area": "flooded_km2", "pct_pop": "pop_exposed", "pct_cropland": "cropland_ha_exposed"}[c]] / df[d_], np.nan)
df.to_csv(OUT + "exposure_by_district_year.csv", index=False)
for name, a in (("years_flooded_lower.tif", yrs_low), ("years_flooded_upper.tif", yrs_up)):
    with rasterio.open(OUT + name, "w", driver="GTiff", height=ROWS, width=COLS, count=1, dtype="uint8", crs="EPSG:4326", transform=TR,
                       compress="lzw", tiled=True, blockxsize=256, blockysize=256) as d:
        d.write(a, 1)
g = df.groupby(["iso", "year", "bound"])[["flooded_km2", "pop_exposed", "cropland_ha_exposed", "buildings_exposed"]].sum(min_count=1).round(0)
pd.set_option("display.width", 220); pd.set_option("display.max_rows", 200)
print("\n=== totals by country, year and bound (inside the study box; Nepal buildings = no data) ===")
print(g.to_string())
print("\nwritten:", OUT)
