import sys
import pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
p = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/processed/sdg/flood_eval/item_counts.csv"
raw_lines = open(p, encoding="utf-8").read().splitlines()
print("file lines (incl. header):", len(raw_lines))
print("last line:", raw_lines[-1][:140])
df = pd.read_csv(p, on_bad_lines="warn")
print("rows:", len(df), "| unique items:", df["id"].nunique(), "of 5839")
per = df.groupby("id").size()
print("rows per item (expect 112 = 2 variants x 2 dems x 14 thresholds):")
print(per.value_counts().to_string())
print("\nlatest scene date scored:", df["day"].max(), "| earliest:", df["day"].min())
print("items per year:"); print(df.drop_duplicates("id")["day"].str[:4].value_counts().sort_index().to_string())
