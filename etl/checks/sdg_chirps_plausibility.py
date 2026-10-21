"""Read-only plausibility check: do observed flood areas (GFM, per scene day) follow antecedent rainfall (CHIRPS), for unflagged vs flagged scenes?
Writes only data/processed/sdg/flood_eval/chirps_box_daily.csv (cache). Plausibility check, NOT proof.
Usage: uv run python -I -u etl/checks/sdg_chirps_plausibility.py"""
import sys, glob, os, re
import numpy as np, pandas as pd, rasterio
from rasterio.windows import from_bounds
sys.stdout.reconfigure(encoding="utf-8")
BOX = (81.9, 25.4, 84.0, 28.0)          # same box the flood scoring used
CACHE = "data/processed/sdg/flood_eval/chirps_box_daily.csv"
COUNTS = "data/processed/sdg/flood_eval/item_counts.csv"
if os.path.exists(CACHE):
    rain = pd.read_csv(CACHE, parse_dates=["day"])
else:
    rows = []
    fs = sorted(glob.glob("data/external/rainfall/chirps/*/*.tif.gz"))
    for i, f in enumerate(fs):
        m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\.tif", f)
        with rasterio.open("/vsigzip/" + f.replace("\\", "/")) as r:
            a = r.read(1, window=from_bounds(*BOX, r.transform)).astype("float64")
        a[a < 0] = np.nan                    # CHIRPS no-data is negative
        rows.append((pd.Timestamp(f"{m[1]}-{m[2]}-{m[3]}"), np.nanmean(a)))
        if (i + 1) % 200 == 0: print(f"  rain {i+1}/{len(fs)}", flush=True)
    rain = pd.DataFrame(rows, columns=["day", "rain_mm"]); os.makedirs(os.path.dirname(CACHE), exist_ok=True); rain.to_csv(CACHE, index=False)
print("rain days:", len(rain), "| box-mean daily rain (mm): mean", round(rain.rain_mm.mean(), 2), "max", round(rain.rain_mm.max(), 1))
rain = rain.sort_values("day").set_index("day")
rain["ante10"] = rain.rain_mm.rolling("10D", min_periods=10).sum()      # rain on the scene day and the 9 days before

c = pd.read_csv(COUNTS)
print("columns:", list(c.columns)); print("variants:", c.variant.unique()[:6], "| dems:", c.dem.unique()[:4], "| flag values:", c.flag.unique()[:4])
v = [x for x in c.variant.unique() if "main" in str(x).lower()]; v = v[0] if v else c.variant.unique()[0]
dm = c.dem.unique()[0]; t0 = sorted(c.t.unique())[0]
c = c[(c.variant == v) & (c.dem == dm) & (c.t == t0)].drop_duplicates(["id", "tile"])   # one row per scene-tile
c["day"] = pd.to_datetime(c.day).dt.normalize()
g = c.groupby(["day", "flag"]).agg(n_flood=("n_flood", "sum"), n_valid=("n_valid", "sum")).reset_index()
g["frac"] = g.n_flood / g.n_valid
g = g.join(rain[["ante10"]], on="day").dropna(subset=["ante10"])
print(f"\nvariant={v}, dem={dm}; scene-days with 10-day rain available: {len(g)} (CHIRPS covers 2019-2025 only)")
q1, q2 = rain.ante10.dropna().quantile([1 / 3, 2 / 3])
print(f"10-day rain terciles over all days: <{q1:.0f} mm dry | {q1:.0f}-{q2:.0f} mid | >{q2:.0f} wet")
g["rain_class"] = pd.cut(g.ante10, [-1, q1, q2, 1e9], labels=["dry", "mid", "wet"])
for fl, x in g.groupby("flag"):
    print(f"\nflag = {fl}: scene-days {len(x)}")
    print("  Spearman(flooded fraction, 10-day rain) =", round(x.frac.corr(x.ante10, method="spearman"), 3))
    t = x.groupby("rain_class", observed=True).agg(days=("frac", "size"), mean_flood_frac_pct=("frac", lambda s: 100 * s.mean()), median_pct=("frac", lambda s: 100 * s.median()))
    print(t.round(3).to_string())
print("\nReading: a bound that follows rainfall (higher flooded fraction in wet class, positive Spearman) is more plausible. Flat or reversed = suspicious. Small samples = inconclusive.")
