"""District rainfall features from CHIRPS (patch 12, step 1). Reads only; writes two new CSV files.
Run from the repo root:  uv run python -I -u etl/forecast/build_rain_features.py
Reads   data/external/rainfall/chirps/*/*.tif.gz   (CHIRPS 2.0 daily, June-October 2019-2025; file name holds YYYY.MM.DD)
        data/processed/sdg/districts_ext/districts_ext.geojson   (districts, with did, shapeName, iso)
Writes  data/processed/sdg/forecast/chirps_district_daily.csv           day, did, rain_mm   (district mean of the CHIRPS cells inside the district)
        data/processed/sdg/forecast/rain_features_district_year.csv     per district and year: season total, wettest 10 days, wettest 3 days, July-August total
Districts with no CHIRPS cell inside the downloaded area are left out and listed. Nothing is guessed."""
import glob, json, os, re, sys
from pathlib import Path
import numpy as np, pandas as pd, rasterio
from rasterio.features import rasterize
from rasterio.windows import Window, from_bounds

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; SDG = ROOT / "data" / "processed" / "sdg"; OUT = SDG / "forecast"
GEOJSON = SDG / "districts_ext" / "districts_ext.geojson"; PATTERN = str(ROOT / "data" / "external" / "rainfall" / "chirps" / "*" / "*.tif.gz")
CACHE = OUT / "chirps_district_daily.csv"; FEAT = OUT / "rain_features_district_year.csv"
MIN_DAYS = 140                       # June 1 to October 31 is 153 days; a year with fewer than 140 days present is left out

def day_of(path):
    m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\.tif", path)
    return pd.Timestamp(f"{m[1]}-{m[2]}-{m[3]}") if m else None

def daily_table(files, feats):
    ids = np.array([f["properties"]["did"] for f in feats], dtype=np.int64)
    with rasterio.open("/vsigzip/" + files[0].replace("\\", "/")) as r0:
        xs = [c[0] for f in feats for ring in _rings(f["geometry"]) for c in ring]; ys = [c[1] for f in feats for ring in _rings(f["geometry"]) for c in ring]
        w = from_bounds(min(xs), min(ys), max(xs), max(ys), r0.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, r0.width, r0.height)); tr = r0.window_transform(w); shape = (int(w.height), int(w.width))
        grid = rasterize([(f["geometry"], int(f["properties"]["did"])) for f in feats], out_shape=shape, transform=tr, fill=0, all_touched=True, dtype="int32")
    present = np.unique(grid[grid > 0]); print(f"CHIRPS window {shape[1]} x {shape[0]} cells; districts with at least one cell: {len(present)} of {len(feats)}")
    lut = {d: i for i, d in enumerate(present)}; idx = np.vectorize(lambda v: lut.get(v, -1))(grid).ravel()
    ok = idx >= 0; n = len(present); rows = []
    for i, f in enumerate(files):
        with rasterio.open("/vsigzip/" + f.replace("\\", "/")) as r:
            a = r.read(1, window=w).astype("float64").ravel()
        a[a < 0] = np.nan                                 # CHIRPS no-data is negative
        v = ok & np.isfinite(a)
        s = np.bincount(idx[v], weights=a[v], minlength=n); c = np.bincount(idx[v], minlength=n)
        mean = np.where(c > 0, s / np.maximum(c, 1), np.nan); day = day_of(f)
        rows.extend((day, int(d), float(m)) for d, m in zip(present, mean))
        if (i + 1) % 100 == 0: print(f"  {i+1}/{len(files)} days", flush=True)
    return pd.DataFrame(rows, columns=["day", "did", "rain_mm"])

def _rings(g):
    if g["type"] == "Polygon": return g["coordinates"]
    return [r for p in g["coordinates"] for r in p]

def features(daily, did_names):
    out = []
    for (did, yr), g in daily.groupby(["did", daily["day"].dt.year]):
        g = g.dropna(subset=["rain_mm"]).sort_values("day").set_index("day")["rain_mm"]
        g = g[(g.index.month >= 6) & (g.index.month <= 10)]
        if len(g) < MIN_DAYS: continue
        g = g.reindex(pd.date_range(f"{yr}-06-01", f"{yr}-10-31")).interpolate(limit=3)   # short gaps only
        if g.isna().any(): continue
        out.append({"did": did, "year": yr, "days_present": int(len(g)), "season_sum_mm": float(g.sum()), "max10_mm": float(g.rolling(10).sum().max()), "max3_mm": float(g.rolling(3).sum().max()),
                    "julaug_sum_mm": float(g[(g.index.month == 7) | (g.index.month == 8)].sum())})
    f = pd.DataFrame(out)
    return f.merge(did_names, on="did", how="left")

def main():
    files = sorted(glob.glob(PATTERN))
    if not files: sys.exit(f"STOP: no CHIRPS files found with {PATTERN}. Run from the repo root.")
    if not GEOJSON.exists(): sys.exit(f"STOP: {GEOJSON} not found. Run the etl/sdg steps first.")
    feats = json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]; OUT.mkdir(parents=True, exist_ok=True)
    names = pd.DataFrame([{"did": int(f["properties"]["did"]), "iso": f["properties"]["iso"], "district": f["properties"]["shapeName"]} for f in feats])
    if CACHE.exists(): daily = pd.read_csv(CACHE, parse_dates=["day"]); print(f"Using the cached daily table {CACHE.name} ({len(daily)} rows). Delete it to rebuild.")
    else: print(f"{len(files)} CHIRPS files"); daily = daily_table(files, feats); daily.to_csv(CACHE, index=False)
    fe = features(daily, names); fe = fe[["iso", "district", "did", "year", "days_present", "season_sum_mm", "max10_mm", "max3_mm", "julaug_sum_mm"]].sort_values(["iso", "district", "year"])
    fe.to_csv(FEAT, index=False)
    left = sorted(set(names["district"]) - set(fe["district"]))
    print(f"\nWrote {FEAT.name}: {len(fe)} district-years, {fe[['iso','district']].drop_duplicates().shape[0]} districts, years {sorted(fe['year'].unique())}.")
    print(f"Left out (no usable CHIRPS data): {len(left)} districts" + (f" e.g. {left[:5]}" if left else ""))
    print("Season total (mm), all district-years: min %.0f, median %.0f, max %.0f" % (fe.season_sum_mm.min(), fe.season_sum_mm.median(), fe.season_sum_mm.max()))

if __name__ == "__main__":
    main()
