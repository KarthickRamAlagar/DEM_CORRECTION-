import sys
import pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
df = pd.read_csv("C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/flood_observed/gfm/items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df["flag"] = df["anomaly_detected"].astype(str)
df["flooded_pixels"] = pd.to_numeric(df["flooded_pixels"], errors="coerce")
s = df.drop_duplicates(subset=["datetime", "floodable_pixels", "flooded_pixels", "flag"]).copy()   # one count per scene
s["month"] = s["datetime"].dt.month
p = s.pivot_table(index="month", columns="flag", values="flooded_pixels", aggfunc="sum", fill_value=0)
n = s.pivot_table(index="month", columns="flag", values="id", aggfunc="count", fill_value=0)
out = pd.DataFrame({"scenes_unflagged": n.get("False"), "scenes_flagged": n.get("True"),
                    "flood_share_unflagged_%": (100 * p["False"] / p["False"].sum()).round(1),
                    "flood_share_flagged_%": (100 * p["True"] / p["True"].sum()).round(1)})
print("share of all flooded pixels falling in each calendar month (one count per scene)")
print(out.to_string())
