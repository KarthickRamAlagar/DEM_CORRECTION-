"""Extended-region exposure from OBSERVED GFM floods only (no corrected-DEM claims). Region 80.3-86.8 E x 25.0-29.0 N, 3-arcsec grid.
Stages: districts | base | years | all. Writes ONLY to data/processed/sdg/{districts_ext,exposure_base_ext,exposure_ext}/.
Population = WorldPop 2020 (modelled); land cover = WorldCover 2021; buildings = VIDA (India only 81.9-84.1E x 25.4-28.1N, Nepal 80.0-86.9E x 26.3-29.1N)."""
import sys, os, glob, re, time, argparse
import numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling
from shapely.geometry import box

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
EXT = ROOT + "data/external/"; SDG = ROOT + "data/processed/sdg/"
DIRD, BASE, OUT, FL = SDG + "districts_ext/", SDG + "exposure_base_ext/", SDG + "exposure_ext/", SDG + "flood_annual/"
W, S, E, N = 80.3, 25.0, 86.8, 29.0
PX = 1 / 1200; COLS, ROWS = int(round((E - W) / PX)), int(round((N - S) / PX)); TR = from_origin(W, N, PX, PX)
BLK = 400
ap = argparse.ArgumentParser(); ap.add_argument("--stage", choices=["districts", "base", "years", "all"], default="all"); a = ap.parse_args()
t0 = time.time()
def stamp(m): print(f"[{(time.time()-t0)/60:5.1f} min] {m}", flush=True)
lat_c = N - (np.arange(ROWS) + 0.5) * PX
cell_km2 = ((PX * 111.32 * np.cos(np.radians(lat_c))) * (PX * 110.95)).astype("float64")
def area_rows(r0, r1): return np.repeat(cell_km2[r0:r1, None], COLS, axis=1)
def save(path, arr, dtype, nodata=None):
    with rasterio.open(path, "w", driver="GTiff", height=ROWS, width=COLS, count=1, dtype=dtype, crs="EPSG:4326", transform=TR,
                       nodata=nodata, compress="lzw", tiled=True, blockxsize=256, blockysize=256) as d:
        d.write(arr.astype(dtype), 1)
def rd(path):
    with rasterio.open(path) as s: return s.read(1), s.nodata

def stage_districts():
    os.makedirs(DIRD, exist_ok=True); B = box(W, S, E, N); parts = []
    for iso in ("IND", "NPL"):
        g = gpd.read_file(EXT + f"boundaries/geoboundaries/geoBoundaries-{iso}-ADM2.geojson")
        g["geometry"] = g.geometry.make_valid(); g = g[g.intersects(B)].copy()
        g["area_km2_total"] = g.to_crs(6933).area / 1e6
        g["geometry"] = g.geometry.intersection(B); g = g[~g.geometry.is_empty].copy()
        g["area_km2_in_region"] = g.to_crs(6933).area / 1e6; g["share_in_region"] = g["area_km2_in_region"] / g["area_km2_total"]
        g["iso"] = iso; parts.append(g[["iso", "shapeName", "shapeID", "area_km2_total", "area_km2_in_region", "share_in_region", "geometry"]])
    d = pd.concat(parts, ignore_index=True); d = d[d["area_km2_in_region"] >= 1].reset_index(drop=True); d["did"] = d.index + 1
    gpd.GeoDataFrame(d, crs="EPSG:4326").to_file(DIRD + "districts_ext.geojson", driver="GeoJSON")
    d.drop(columns="geometry").to_csv(DIRD + "districts_ext.csv", index=False)
    for iso, g in d.groupby("iso"):
        print(f"{iso}: {len(g)} districts | fully inside (>=99%): {(g.share_in_region>=0.99).sum()} | <=50% inside: {(g.share_in_region<=0.5).sum()} | area {g.area_km2_in_region.sum():,.0f} km2")
    stamp("districts done")

def pop_layer(path):
    with rasterio.open(path) as s:
        T = s.transform; assert abs(T.a - PX) < 1e-9, "population pixel size is not 3 arcsec"
        dst = np.full((ROWS, COLS), np.nan, dtype="float32")
        reproject(source=rasterio.band(s, 1), destination=dst, dst_transform=TR, dst_crs="EPSG:4326", src_nodata=s.nodata, dst_nodata=np.nan, resampling=Resampling.sum)
        dst[dst < 0] = np.nan
        raw = s.read(1, window=Window(int(round((W - T.c) / T.a)), int(round((T.f - N) / (-T.e))), COLS, ROWS), boundless=True, fill_value=s.nodata)
        rs = float(np.where((raw == s.nodata) | (raw < 0), 0, raw).sum(dtype=np.float64)); del raw
        print(f"  {os.path.basename(path)}: people raw {rs:,.0f} | resampled {np.nansum(dst, dtype=np.float64):,.0f}", flush=True)
    return dst

def count_buildings(files, tag):
    pat = re.compile(r"buildings_([\d.]+)_([\d.]+)\.parquet"); keys, idxs, rows_read = [], [], 0
    for i, p in enumerate(files):
        fw, fs = (float(x) for x in pat.search(os.path.basename(p)).groups())
        d = pd.read_parquet(p, columns=["xmin", "ymin", "xmax", "ymax"])
        if len(d) == 0: continue
        xmin, ymin = d.xmin.values, d.ymin.values
        cx, cy = (xmin + d.xmax.values) / 2, (ymin + d.ymax.values) / 2
        assert 60 < cx.min() and cx.max() < 100 and 5 < cy.min() and cy.max() < 40, f"{os.path.basename(p)}: bbox columns are not lon/lat"
        rows_read += len(cx)
        own = (cx >= fw) & (cx < fw + 0.25) & (cy >= fs) & (cy < fs + 0.25) & (cx >= W) & (cx < E) & (cy >= S) & (cy < N)
        col = np.clip(((cx[own] - W) / PX).astype(np.int64), 0, COLS - 1); row = np.clip(((N - cy[own]) / PX).astype(np.int64), 0, ROWS - 1)
        idxs.append((row * COLS + col).astype(np.int64))
        keys.append(np.round(xmin[own] * 1e5).astype(np.int64) * 10**8 + np.round(ymin[own] * 1e5).astype(np.int64))
        if (i + 1) % 100 == 0: stamp(f"{tag} buildings: {i+1}/{len(files)} files")
    key, idx = np.concatenate(keys), np.concatenate(idxs)
    _, first = np.unique(key, return_index=True)
    stamp(f"{tag} buildings: rows read {rows_read:,} | in region {len(key):,} | exact duplicates removed {len(key)-len(first):,} | kept {len(first):,}")
    return np.bincount(idx[first], minlength=ROWS * COLS).astype("int32").reshape(ROWS, COLS)

def stage_base():
    os.makedirs(BASE, exist_ok=True)
    g = gpd.read_file(DIRD + "districts_ext.geojson").reset_index(drop=True); g["did"] = g.index + 1
    dist = rasterize(((geom, int(i)) for geom, i in zip(g.geometry, g.did)), out_shape=(ROWS, COLS), transform=TR, fill=0, dtype="uint16")
    save(BASE + "district_id.tif", dist, "uint16", 0); g.drop(columns="geometry").to_csv(BASE + "districts_table.csv", index=False)
    cn = np.array([0] + [1 if v == "IND" else 2 for v in g["iso"]], dtype="uint8")[dist]
    stamp(f"grid {COLS} x {ROWS} | districts {len(g)} | cells inside {(dist>0).sum():,}")
    # GFM tile coverage
    cov = np.zeros((ROWS, COLS), "uint8"); tiles = sorted(glob.glob(FL + "unflagged/flood_nscenes_2019_*.tif")); assert tiles, "annual flood tiles missing"
    for p in tiles:
        with rasterio.open(p) as s:
            tmp = np.zeros((ROWS, COLS), "uint8")
            reproject(source=np.ones((s.height, s.width), "uint8"), destination=tmp, src_transform=s.transform, src_crs=s.crs, dst_transform=TR, dst_crs="EPSG:4326", resampling=Resampling.nearest)
            cov |= tmp
    save(BASE + "gfm_cov.tif", cov, "uint8"); stamp(f"GFM coverage saved ({int(cov.sum()):,} cells covered)")
    pop = np.where(cn == 1, pop_layer(EXT + "population/worldpop/ind_pop_2020_CN_100m_R2024B_v1.tif"),
                   np.where(cn == 2, pop_layer(EXT + "population/worldpop/npl_pop_2020_CN_100m_R2024B_v1.tif"), np.nan)).astype("float32")
    save(BASE + "pop_2020.tif", np.where(np.isfinite(pop), pop, -9999), "float32", -9999); stamp(f"population saved | {np.nansum(pop, dtype=np.float64):,.0f} people inside districts")
    del pop
    crop = np.zeros((ROWS, COLS), "float32"); built = np.zeros((ROWS, COLS), "float32")
    for lat0 in (24, 27):
        for lon0 in (78, 81, 84):
            top, right = lat0 + 3, lon0 + 3
            lat_hi, lat_lo, lon_lo, lon_hi = min(top, N), max(lat0, S), max(lon0, W), min(right, E)
            if lat_hi <= lat_lo or lon_hi <= lon_lo: continue
            path = EXT + f"landcover/worldcover/ESA_WorldCover_10m_2021_v200_N{lat0:02d}E{lon0:03d}_Map.tif"; assert os.path.exists(path), "missing WorldCover tile " + path
            r_start, r_end = int(round((N - lat_hi) * 1200)), int(round((N - lat_lo) * 1200)); c_start, c_end = int(round((lon_lo - W) * 1200)), int(round((lon_hi - W) * 1200))
            with rasterio.open(path) as s:
                assert s.width == 36000
                for rs in range(r_start, r_end, 300):
                    re_ = min(rs + 300, r_end)
                    x = s.read(1, window=Window(int(round((lon_lo - lon0) * 12000)), int(round((top - (N - rs * PX)) * 12000)), (c_end - c_start) * 10, (re_ - rs) * 10))
                    crop[rs:re_, c_start:c_end] = (x == 40).reshape(re_ - rs, 10, c_end - c_start, 10).mean(axis=(1, 3))
                    built[rs:re_, c_start:c_end] = (x == 50).reshape(re_ - rs, 10, c_end - c_start, 10).mean(axis=(1, 3))
            stamp(f"land cover tile N{lat0}E{lon0:03d} done")
    save(BASE + "cropland_frac.tif", crop, "float32"); save(BASE + "builtup_frac.tif", built, "float32"); del crop, built
    bi = count_buildings(sorted(glob.glob(EXT + "buildings/vida/buildings_*.parquet")), "India"); bn = count_buildings(sorted(glob.glob(EXT + "buildings/vida_npl/buildings_*.parquet")), "Nepal")
    bc = np.where(cn == 1, bi, np.where(cn == 2, bn, 0)).astype("int32"); del bi, bn
    rr, cc = np.meshgrid(np.arange(ROWS), np.arange(COLS), indexing="ij") if False else (None, None)
    lon_c = W + (np.arange(COLS) + 0.5) * PX
    in_ind = (lon_c[None, :] >= 81.9) & (lon_c[None, :] < 84.1) & (lat_c[:, None] >= 25.4) & (lat_c[:, None] < 28.1)
    in_npl = (lon_c[None, :] >= 80.0) & (lon_c[None, :] < 86.9) & (lat_c[:, None] >= 26.3) & (lat_c[:, None] < 29.1)
    ok = ((cn == 1) & in_ind) | ((cn == 2) & in_npl)
    save(BASE + "bldg_count.tif", np.minimum(bc, 65535), "uint16"); save(BASE + "bldg_ok.tif", ok.astype("uint8"), "uint8"); stamp("base layers saved -> " + BASE)

def stage_years():
    os.makedirs(OUT, exist_ok=True)
    dist, _ = rd(BASE + "district_id.tif"); tab = pd.read_csv(BASE + "districts_table.csv"); nd = len(tab) + 1
    pop, pnd = rd(BASE + "pop_2020.tif"); pop = np.where(pop == pnd, 0, pop).astype("float32")
    crop, _ = rd(BASE + "cropland_frac.tif"); bc, _ = rd(BASE + "bldg_count.tif"); cov, _ = rd(BASE + "gfm_cov.tif"); ok, _ = rd(BASE + "bldg_ok.tif")
    def zs(fn):
        out = np.zeros(nd)
        for r0 in range(0, ROWS, BLK):
            r1 = min(r0 + BLK, ROWS); out += np.bincount(dist[r0:r1].ravel().astype(np.int64), weights=fn(r0, r1), minlength=nd)
        return out[1:]
    A = lambda r0, r1: area_rows(r0, r1).ravel()
    tot = dict(km2=zs(A), pop=zs(lambda a, b: pop[a:b].ravel()), crop=zs(lambda a, b: crop[a:b].ravel() * A(a, b) * 100), bld=zs(lambda a, b: bc[a:b].ravel().astype("float64")))
    gfm_cov = zs(lambda a, b: cov[a:b].ravel() * A(a, b)) / tot["km2"]; bld_cov = zs(lambda a, b: ok[a:b].ravel() * A(a, b)) / tot["km2"]
    def flood_grid(view, year):
        out = np.zeros((ROWS, COLS), "uint8"); files = glob.glob(FL + f"{view}/flood_nscenes_{year}_*.tif"); assert files, f"no flood files {view} {year}"
        for p in files:
            tmp = np.zeros((ROWS, COLS), "uint8")
            with rasterio.open(p) as s:
                reproject(source=rasterio.band(s, 1), destination=tmp, dst_transform=TR, dst_crs="EPSG:4326", resampling=Resampling.nearest, dst_nodata=0)
            out = np.maximum(out, tmp)
        return out > 0
    def metrics(fl):
        return dict(km2=zs(lambda a, b: fl[a:b].ravel() * A(a, b)), pop=zs(lambda a, b: fl[a:b].ravel() * pop[a:b].ravel()),
                    crop=zs(lambda a, b: fl[a:b].ravel() * crop[a:b].ravel() * A(a, b) * 100), bld=zs(lambda a, b: fl[a:b].ravel() * bc[a:b].ravel()))
    rows = []; yl = np.zeros((ROWS, COLS), "uint8"); yu = np.zeros((ROWS, COLS), "uint8"); el = np.zeros((ROWS, COLS), bool); eu = np.zeros((ROWS, COLS), bool)
    def add(year, bound, m):
        d = pd.DataFrame(dict(iso=tab["iso"], district=tab["shapeName"], share_in_region=tab["share_in_region"], gfm_coverage=gfm_cov, bldg_coverage=bld_cov, year=year, bound=bound,
                              flooded_km2=m["km2"], pop_exposed=m["pop"], cropland_ha_exposed=m["crop"], buildings_exposed=m["bld"],
                              district_area_km2=tot["km2"], district_pop=tot["pop"], district_cropland_ha=tot["crop"], district_buildings=tot["bld"]))
        d.loc[d["bldg_coverage"] < 0.99, ["buildings_exposed", "district_buildings"]] = np.nan      # no data, not zero
        rows.append(d)
    for year in range(2019, 2027):
        fu, ff = flood_grid("unflagged", year), flood_grid("flagged", year); up = fu | ff
        add(year, "lower_unflagged", metrics(fu)); add(year, "upper_union", metrics(up))
        yl += fu.astype("uint8"); yu += up.astype("uint8"); el |= fu; eu |= up; stamp(f"{year} done")
    add("2019-2026 ever", "lower_unflagged", metrics(el)); add("2019-2026 ever", "upper_union", metrics(eu))
    df = pd.concat(rows, ignore_index=True)
    df["pct_area"] = 100 * df["flooded_km2"] / df["district_area_km2"]; df["pct_pop"] = 100 * df["pop_exposed"] / df["district_pop"].replace(0, np.nan); df["pct_cropland"] = 100 * df["cropland_ha_exposed"] / df["district_cropland_ha"].replace(0, np.nan)
    df.to_csv(OUT + "exposure_by_district_year_ext.csv", index=False)
    for name, arr in (("years_flooded_lower.tif", yl), ("years_flooded_upper.tif", yu)): save(OUT + name, arr, "uint8")
    pd.set_option("display.width", 220); pd.set_option("display.max_rows", 200)
    g = df.groupby(["iso", "year", "bound"])[["flooded_km2", "pop_exposed", "cropland_ha_exposed"]].sum().round(0)
    print("\n=== totals by country/year/bound (people, cropland, area; observed GFM only; districts with <99% GFM coverage still included - see gfm_coverage) ===\n" + g.to_string())
    print("\n=== districts with gfm_coverage < 0.99 ==="); print(tab.assign(gfm_coverage=gfm_cov.round(2))[gfm_cov < 0.99][["iso", "shapeName", "gfm_coverage"]].to_string(index=False))
    print("\n=== Nepal districts, ever flooded 2019-2026 ===")
    n = df[(df["iso"] == "NPL") & (df["year"] == "2019-2026 ever")].pivot_table(index="district", columns="bound", values=["pop_exposed", "cropland_ha_exposed"], aggfunc="sum").round(0)
    print(n.to_string()); stamp("done -> " + OUT)

if a.stage in ("districts", "all"): stage_districts()
if a.stage in ("base", "all"): stage_base()
if a.stage in ("years", "all"): stage_years()
