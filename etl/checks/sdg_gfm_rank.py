import sys
import numpy as np, pandas as pd, rasterio
sys.stdout.reconfigure(encoding="utf-8")
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/flood_observed/gfm/"
df = pd.read_csv(base + "items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df["day"] = df["datetime"].dt.strftime("%Y-%m-%d")
df["flag"] = df["anomaly_detected"].astype(str)
df["flooded_pixels"] = pd.to_numeric(df["flooded_pixels"], errors="coerce")

# one count per scene (same datetime + same stats) -> drop tile duplicates
scene = df.drop_duplicates(subset=["datetime", "floodable_pixels", "flooded_pixels", "flag"])
print("items:", len(df), "| unique scenes:", len(scene))
print(scene["flag"].value_counts().to_string())

p = scene.pivot_table(index="day", columns="flag", values="flooded_pixels", aggfunc="sum", fill_value=0)
for c in ["False", "True"]:
    if c not in p: p[c] = 0
print("\n=== top 15 days by flooded pixels in UNFLAGGED scenes (one count per scene) ===")
print(p.sort_values("False", ascending=False)[["False", "True"]].head(15).to_string())
print("\nunflagged scenes with >100,000 flooded pixels:", int(((scene['flag']=='False') & (scene['flooded_pixels']>100000)).sum()))
print("unflagged scenes with >20,000 flooded pixels:", int(((scene['flag']=='False') & (scene['flooded_pixels']>20000)).sum()))

best = df[df["flag"] == "False"].sort_values("flooded_pixels", ascending=False).iloc[0]
print("\n=== code cross-tab on largest unflagged item:", best["id"], "| flooded_pixels", int(best["flooded_pixels"]))
def rd(col):
    with rasterio.open(base + str(best[col]).replace("\\", "/")) as r:
        return r.read(1, out_shape=(1500, 1500))
f, e, w = rd("flood_extent"), rd("exclusion_mask"), rd("reference_water")
ok = f != 255
print("\nflood (rows) vs exclusion (cols), observed pixels only:")
print(pd.crosstab(f[ok], e[ok]).to_string())
print("\nflood (rows) vs reference_water (cols), observed pixels only:")
print(pd.crosstab(f[ok], w[ok]).to_string())
