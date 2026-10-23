"""Read-only scan that tells patch 14's next step where things are (river lines, flood scene files, DEM grid). Changes nothing.
  uv run python -I etl/physics/discover_inputs.py        -> prints and writes etl/physics/discover_report.txt (send me that file)"""
import sys, collections, re
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
def size(f): return f"{f.stat().st_size/1e6:.1f} MB"
p("== DEM rasters")
try:
    import rasterio
    for n in ("raw_dem_2022.tif", "corrected_dem_2022.tif"):
        f = ROOT / "data/final/corrected_rasters" / n
        if f.exists():
            with rasterio.open(f) as d: p(n, size(f), d.crs, "res", d.res, "shape", d.shape, "bounds", tuple(round(x, 4) for x in d.bounds), "nodata", d.nodata)
        else: p(n, "MISSING")
except Exception as e: p("rasterio unavailable:", e)
p("\n== HAND / channel rasters")
for f in sorted((ROOT / "data/processed/sdg/hand").glob("*"))[:20]: p(f.relative_to(ROOT), size(f))
p("\n== OSM files (rivers/streams)")
osm = ROOT / "data/external/osm"
for f in sorted(osm.rglob("*"))[:60]:
    if f.is_file(): p(f.relative_to(ROOT), size(f))
p("\n== GFM flood files")
g = ROOT / "data/external/flood_observed/gfm"; names = collections.Counter(); ex = []
for f in g.rglob("*"):
    if f.is_file():
        names[f.suffix.lower()] += 1
        if len(ex) < 14 and f.suffix.lower() in (".tif", ".tiff", ".json"): ex.append(f)
p("by extension:", dict(names))
for f in ex: p(f.relative_to(ROOT), size(f))
p("\n== GloFAS history files")
for f in sorted((ROOT / "data/external/glofas/historical").glob("*.nc")): p(f.name, size(f))
p("\n== flood_eval_counts.py (first 90 lines)")
f = ROOT / "etl/sdg/flood_eval_counts.py"
if f.exists():
    for i, l in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines()[:90], 1): p(f"{i:3d} {l}")
else: p("MISSING", f)
(ROOT / "etl/physics/discover_report.txt").write_text("\n".join(out), encoding="utf-8"); print("\nWrote etl/physics/discover_report.txt")
