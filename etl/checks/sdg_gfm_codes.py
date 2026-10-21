import sys
import numpy as np, pandas as pd, rasterio
sys.stdout.reconfigure(encoding="utf-8")
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/flood_observed/gfm/"
df = pd.read_csv(base + "items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
day = df[(df["datetime"].dt.strftime("%Y-%m-%d") == "2020-07-12")]
print("items on 2020-07-12:", len(day))
print(day[["tile", "datetime", "anomaly_detected", "floodable_pixels", "flooded_pixels"]].to_string())
row = day[day["anomaly_detected"].astype(str) == "False"].iloc[0]
print("\nusing:", row["id"])
for col in ["flood_extent", "exclusion_mask", "reference_water", "advisory_flags"]:
    p = base + str(row[col]).replace("\\", "/")
    try:
        with rasterio.open(p) as r:
            a = r.read(1, out_shape=(600, 600))
            u, n = np.unique(a, return_counts=True)
            print(f"\n{col}: {p.split('gfm/')[-1]}")
            print("  dtype:", r.dtypes[0], "| nodata tag:", r.nodata, "| size:", r.width, "x", r.height)
            print("  values:", dict(zip(u.tolist(), n.tolist())))
    except Exception as e:
        print(f"\n{col}: cannot read ({type(e).__name__}: {e})")
