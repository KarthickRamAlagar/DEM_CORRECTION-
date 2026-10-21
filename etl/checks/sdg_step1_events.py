import sys
import numpy as np
import pandas as pd
import rasterio

sys.stdout.reconfigure(encoding="utf-8")
root = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
base = root + "data/external/flood_observed/gfm/"

df = pd.read_csv(base + "items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df["day"] = df["datetime"].dt.strftime("%Y-%m-%d")
df["flooded_pixels"] = pd.to_numeric(df["flooded_pixels"], errors="coerce")
df["anomaly_detected"] = df["anomaly_detected"].astype(str)

print("=== anomaly flag counts ===")
print(df["anomaly_detected"].value_counts().to_string())
print("unique tiles:", df["tile"].nunique())

print("\n=== top 15 days by total flooded pixels (all tiles, all items) ===")
g = df.groupby("day").agg(items=("id", "count"), tiles=("tile", "nunique"),
                          flooded=("flooded_pixels", "sum")).sort_values("flooded", ascending=False)
print(g.head(15).to_string())

print("\n=== one flood raster ===")
p = base + df.iloc[0]["flood_extent"].replace("\\", "/")
with rasterio.open(p) as r:
    print(p.split("gfm/")[-1])
    print("crs:", r.crs, "| size:", r.width, "x", r.height, "| res:", r.res)
    print("bounds:", r.bounds)
    a = r.read(1, out_shape=(min(r.height, 500), min(r.width, 500)))
    print("values (downsampled):", dict(zip(*[x.tolist() for x in np.unique(a, return_counts=True)])))
