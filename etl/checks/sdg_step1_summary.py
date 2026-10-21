import json, sys
import pandas as pd
import rasterio

sys.stdout.reconfigure(encoding="utf-8")
root = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"

print("=== GFM items.csv ===")
df = pd.read_csv(root + "data/external/flood_observed/gfm/items.csv")
print("rows:", len(df))
print("columns:", list(df.columns))
print(df.head(3).to_string())
dcols = [c for c in df.columns if "date" in c.lower() or "time" in c.lower()]
if dcols:
    d = pd.to_datetime(df[dcols[0]], errors="coerce", utc=True)
    print("date column used:", dcols[0], "| range:", d.min(), "to", d.max())
    print("items per year:"); print(d.dt.year.value_counts().sort_index().to_string())
    print("items per year-month (top 12 busiest):")
    print(d.dt.to_period("M").value_counts().head(12).to_string())

print("\n=== corrected DEM extent ===")
with rasterio.open(root + "data/final/corrected_rasters/corrected_dem_2022.tif") as r:
    print("bounds:", r.bounds, "| crs:", r.crs, "| size:", r.width, "x", r.height)

print("\n=== district boundaries ===")
for iso in ["IND", "NPL"]:
    p = root + f"data/external/boundaries/geoboundaries/geoBoundaries-{iso}-ADM2.geojson"
    g = json.load(open(p, encoding="utf-8"))
    f = g["features"]
    print(iso, "districts:", len(f), "| property keys:", list(f[0]["properties"].keys()))
