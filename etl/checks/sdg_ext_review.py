import sys, os, glob
import numpy as np, pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
print("=== A. buildings folders ===")
for name in ("vida", "vida_npl"):
    base = ROOT + f"data/external/buildings/{name}/"
    top = sorted(glob.glob(base + "buildings_*.parquet")); allp = glob.glob(base + "**/*.parquet", recursive=True)
    subs = sorted({os.path.dirname(p).replace("\\", "/").split(name)[-1] for p in allp})
    print(f"{name}: top-level parquet {len(top)} | all parquet incl. subfolders {len(allp)} | subfolders holding parquet: {subs[:6]}")
    keys, rows = [], 0
    for p in top:
        d = pd.read_parquet(p, columns=["xmin", "ymin"])
        rows += len(d); keys.append(np.round(d.xmin.values * 1e5).astype(np.int64) * 10**8 + np.round(d.ymin.values * 1e5).astype(np.int64))
    k = np.concatenate(keys) if keys else np.array([], dtype=np.int64)
    print(f"   rows in top-level files: {rows:,} | exact duplicate corner pairs: {rows - len(np.unique(k)):,}")
    del k, keys
print("\n=== B. headline exposure, districts with >= 99% GFM coverage only (ever flooded 2019-2026) ===")
df = pd.read_csv(ROOT + "data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv")
cov = df[(df["gfm_coverage"] >= 0.99)]
ev = cov[cov["year"] == "2019-2026 ever"]
g = ev.groupby(["iso", "bound"]).agg(districts=("district", "nunique"), flooded_km2=("flooded_km2", "sum"), pop_exposed=("pop_exposed", "sum"),
                                     cropland_ha=("cropland_ha_exposed", "sum"), pop_total=("district_pop", "sum"), cropland_total=("district_cropland_ha", "sum"))
g["pct_pop"] = (100 * g.pop_exposed / g.pop_total).round(1); g["pct_cropland"] = (100 * g.cropland_ha / g.cropland_total).round(1)
pd.set_option("display.width", 220); print(g.round(0).to_string())
print("\ndistricts left out (coverage < 99%):", int((df[df.year == "2019-2026 ever"].drop_duplicates("district").gfm_coverage < 0.99).sum()) // 1)
print("\n=== C. top 12 Indian districts by people ever flooded (covered districts) ===")
t = ev[ev["iso"] == "IND"].pivot_table(index="district", columns="bound", values="pop_exposed").round(0)
t["district_pop"] = ev[ev["iso"] == "IND"].drop_duplicates("district").set_index("district")["district_pop"].round(0)
print(t.sort_values("upper_union", ascending=False).head(12).to_string())
print("\n=== D. per-year people exposed, covered districts only ===")
y = cov[cov["year"] != "2019-2026 ever"].groupby(["iso", "year", "bound"])["pop_exposed"].sum().unstack("bound").round(0)
print(y.to_string())
