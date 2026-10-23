"""River-flow features from GloFAS history (patch 13, step 1). Reads only data/external/glofas/historical/*.nc; writes three new files.
Run from the repo root:  uv run python -I -u etl/forecast/build_glofas_features.py
Writes  data/processed/sdg/forecast/glofas_levels.npz           per river cell: mean flow, flood levels RL2 / RL5 / RL20 (flow that is reached or passed about once in 2 / 5 / 20 years)
        data/processed/sdg/forecast/river_features_district_year.csv   per district and year: peak flow and mean flow relative to the district's river cells (merged with the rain features if present)
        data/processed/sdg/forecast/glofas_levels_meta.json       years used, method, limits
Method: for every cell the highest daily flow of each June-October season is taken; a Gumbel curve fitted to those yearly maxima gives RL2, RL5, RL20.
        A river cell is a cell whose mean June-October flow is at least MIN_Q m3/s. With about 20 seasons the RL20 is a rough estimate, and the page says so.
Nothing here is a flood warning: a flow above RL2 means a river is high compared with its own history, not that a place floods."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from rasterio.features import rasterize
from rasterio.transform import from_origin

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glofas_io as G

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; SDG = ROOT / "data" / "processed" / "sdg"; OUT = SDG / "forecast"
HIST = ROOT / "data" / "external" / "glofas" / "historical"; GEOJSON = SDG / "districts_ext" / "districts_ext.geojson"
MIN_Q = 50.0; MIN_YEARS = 8; MIN_DAYS = 100; EULER = 0.5772156649

def gumbel_levels(maxima):
    m = np.asarray(maxima, float); mu, s = m.mean(), m.std(ddof=1)
    if not np.isfinite(s) or s <= 0: return [np.nan] * 3
    beta = s * np.sqrt(6) / np.pi; loc = mu - EULER * beta
    return [loc - beta * np.log(-np.log(1 - 1 / T)) for T in (2, 5, 20)]

def main():
    files = sorted(HIST.glob("glofas_hist_*.nc"))
    if len(files) < MIN_YEARS: sys.exit(f"STOP: {len(files)} historical files found in {HIST}; at least {MIN_YEARS} seasons are needed for flood levels. Run: uv run python -I -u etl/forecast/fetch_glofas.py --history")
    seasons, lat, lon, ymax, ymean, years = [], None, None, [], [], []
    for f in files:
        dates, la, lo, a = G.read_history(f); y = int(f.stem.split("_")[-1])
        a = a[(dates.month >= 6) & (dates.month <= 10)]
        if a.shape[0] < MIN_DAYS: print(f"  {y}: only {a.shape[0]} days, left out"); continue
        if lat is None: lat, lon = la, lo
        elif a.shape[1:] != (len(lat), len(lon)): sys.exit(f"STOP: {f.name} has a different grid from the first file.")
        ymax.append(np.nanmax(a, axis=0)); ymean.append(np.nanmean(a, axis=0)); years.append(y)
    ymax, ymean = np.array(ymax), np.array(ymean); mean_all = np.nanmean(ymean, axis=0)
    ny, nx = mean_all.shape; rl = np.full((3, ny, nx), np.nan)
    river = np.isfinite(mean_all) & (mean_all >= MIN_Q)
    for i, j in zip(*np.where(river)):
        rl[:, i, j] = gumbel_levels(ymax[:, i, j])
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "glofas_levels.npz", lat=lat, lon=lon, mean=mean_all.astype("float32"), rl2=rl[0].astype("float32"), rl5=rl[1].astype("float32"), rl20=rl[2].astype("float32"), river=river)
    print(f"{len(years)} seasons {years[0]}-{years[-1]}; grid {ny} x {nx}; river cells (mean flow >= {MIN_Q:.0f} m3/s): {int(river.sum())}")
    # district-year features
    feats = json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]
    dlat = abs(lat[1] - lat[0]); dlon = abs(lon[1] - lon[0]); north = lat.max() + dlat / 2; west = lon.min() - dlon / 2
    flip = lat[0] < lat[-1]                                  # rasterize needs north at the top
    tr = from_origin(west, north, dlon, dlat)
    grid = rasterize([(f["geometry"], int(f["properties"]["did"])) for f in feats], out_shape=(ny, nx), transform=tr, fill=0, all_touched=True, dtype="int32")
    if flip: grid = grid[::-1]
    info = {int(f["properties"]["did"]): (f["properties"]["iso"], f["properties"]["shapeName"]) for f in feats}
    base = np.where(river, mean_all, np.nan); rows = []
    for d, (iso, name) in info.items():
        m = (grid == d) & river
        if m.sum() < 1: continue
        for k, y in enumerate(years):
            pk = ymax[k][m] / base[m]; mn = ymean[k][m] / base[m]
            rows.append({"iso": iso, "district": name, "year": y, "q_peak_ratio": float(np.nanmean(pk)), "q_mean_ratio": float(np.nanmean(mn)), "river_cells": int(m.sum())})
    df = pd.DataFrame(rows)
    rf = OUT / "rain_features_district_year.csv"
    if rf.exists(): df = pd.read_csv(rf).merge(df, on=["iso", "district", "year"], how="inner")
    df.to_csv(OUT / "river_features_district_year.csv", index=False)
    print(f"Wrote river_features_district_year.csv: {len(df)} district-years, {df[['iso','district']].drop_duplicates().shape[0]} districts" + ("" if rf.exists() else " (rain features not found: run build_rain_features.py to merge them)"))
    (OUT / "glofas_levels_meta.json").write_text(json.dumps({"built_utc": pd.Timestamp.now("UTC").isoformat(timespec="seconds"), "seasons": years, "river_cell_min_mean_m3s": MIN_Q, "levels": "RL2/RL5/RL20 = Gumbel fit to yearly June-October maxima of GloFAS v4 daily mean flow",
        "limits": ["About 20 seasons: RL20 is a rough estimate.", "GloFAS flow is a model at about 5 km. A river cell is the nearest big river, not an exact gauge.", "A flow above RL2 means the river is high compared with its own history; it does not by itself mean a place floods."]}, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
