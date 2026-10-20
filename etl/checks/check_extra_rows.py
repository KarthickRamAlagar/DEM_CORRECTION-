import pandas as pd

base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data"
cur = pd.read_parquet(base + "/final/golden_dataset.parquet")
reb = pd.read_parquet(base + "/final_rebuild/golden_dataset.parquet")

key = ["latitude", "longitude", "elevation_ref"]
for d in (cur, reb):
    for k in key:
        d["_" + k] = d[k].round(6)
k2 = ["_" + k for k in key]

m = reb.merge(cur[k2].drop_duplicates(), on=k2, how="left", indicator=True)
extra = m[m["_merge"] == "left_only"]
print("extra rows:", len(extra))
for c in ["source_year", "year_matched", "granule_id", "source_granule"]:
    if c in extra.columns:
        print(c, extra[c].value_counts().head(10).to_dict())
print("lat range extra:", extra["latitude"].min(), extra["latitude"].max())
print("lon range extra:", extra["longitude"].min(), extra["longitude"].max())

col = "spatial_autocorrelation_moran"
for name, d in (("current", cur), ("rebuilt", reb)):
    s = d[col]
    print(name, "min", s.min(), "max", s.max(), "p99", s.quantile(.99), "n>1.5", (s.abs() > 1.5).sum())

j = cur.merge(reb, on=k2, suffixes=("_c", "_r"))
diff = (j[col + "_c"] - j[col + "_r"]).abs()
print("rows with |diff|>0.1:", (diff > 0.1).sum(), "| >1:", (diff > 1).sum())
print(j.loc[diff.nlargest(5).index, [col + "_c", col + "_r"]])
