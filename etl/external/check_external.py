import json, glob
from pathlib import Path
import rasterio
E = Path("data/external")
def tif(p):
    try:
        with rasterio.open(p) as s: return f"OK {s.width}x{s.height}"
    except Exception: return "MISSING or BAD"
def lines(p):
    p = Path(p)
    return sum(1 for _ in open(p, encoding="utf-8", errors="ignore")) - 1 if p.exists() else None
def n(pattern): return len(glob.glob(str(E / pattern), recursive=True))
r = []
for t in ["N24E081", "N27E081"]:
    r.append((f"WorldCover {t}", tif(E / f"landcover/worldcover/ESA_WorldCover_10m_2021_v200_{t}_Map.tif")))
for c in ["ind", "npl"]:
    r.append((f"WorldPop {c.upper()}", tif(E / f"population/worldpop/{c}_pop_2020_CN_100m_R2024B_v1.tif")))
p = E / "costs_norms/MHA_SDRF_NDRF_norms_2022-26.pdf"
r.append(("Norms PDF", "OK" if p.exists() and open(p, "rb").read(5) == b"%PDF-" else "MISSING or BAD"))
for c in ["IND", "NPL"]:
    p = E / f"boundaries/geoboundaries/geoBoundaries-{c}-ADM2.geojson"
    r.append((f"Boundaries {c}", f"OK {len(json.load(open(p, encoding='utf-8'))['features'])} features" if p.exists() else "MISSING"))
r.append(("OSM pieces (want 30)", n("osm/osm_*.json")))
r.append(("Crops rows (want 455359)", lines(E / "crops/apy/apy_district_crops.csv")))
r.append(("Health rows (want 192905)", lines(E / "health_facilities/nin_health_facilities.csv")))
r.append(("Buildings IND pieces", n("buildings/vida/*.parquet")))
r.append(("Buildings NPL pieces", n("buildings/vida_npl/*.parquet")))
r.append(("Rainfall files", n("rain*/**/*.tif*")))
r.append(("GFM files (about 17,512 minus gaps)", n("flood_observed/gfm/**/*.tif")))
for k, v in r: print(f"{k:42} {v}")
