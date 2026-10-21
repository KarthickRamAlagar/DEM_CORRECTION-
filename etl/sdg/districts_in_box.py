"""C1: clip ADM2 districts (India, Nepal) to the analysis box; report share of each district inside the box."""
import sys
import geopandas as gpd, pandas as pd
from shapely.geometry import box
sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
OUT = ROOT + "data/processed/sdg/districts/"
BOX = box(81.9, 25.4, 84.0, 28.0)
parts = []
for iso in ("IND", "NPL"):
    g = gpd.read_file(ROOT + f"data/external/boundaries/geoboundaries/geoBoundaries-{iso}-ADM2.geojson")
    g["geometry"] = g.geometry.make_valid()
    g = g[g.intersects(BOX)].copy()
    g["area_km2_total"] = g.to_crs(6933).area / 1e6
    g["geometry"] = g.geometry.intersection(BOX)
    g["area_km2_in_box"] = g.to_crs(6933).area / 1e6
    g["share_in_box"] = g["area_km2_in_box"] / g["area_km2_total"]
    g["iso"] = iso
    parts.append(g[["iso", "shapeName", "shapeID", "area_km2_total", "area_km2_in_box", "share_in_box", "geometry"]])
d = pd.concat(parts, ignore_index=True)
gpd.GeoDataFrame(d, crs="EPSG:4326").to_file(OUT + "districts_in_box.geojson", driver="GeoJSON")
d.drop(columns="geometry").sort_values(["iso", "shapeName"]).to_csv(OUT + "districts_in_box.csv", index=False)
for iso, g in d.groupby("iso"):
    print(f"{iso}: {len(g)} districts touch the box | fully inside (>=99%): {(g.share_in_box>=0.99).sum()} | "
          f"half or less inside (<=50%): {(g.share_in_box<=0.5).sum()} | area inside box: {g.area_km2_in_box.sum():,.0f} km2")
print("written:", OUT)
