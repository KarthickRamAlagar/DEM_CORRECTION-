"""C6: coordinate system of the flood tiles (Copernicus GFM uses the EQUI7 grid, a projected metre grid, NOT longitude/latitude).
Reads only file headers. Run from the repo root:  uv run python -I etl/checks/check_equi7_crs.py [folder]
It lists up to 4 different tiles, their CRS, pixel size and bounds, converts the bounds to longitude/latitude, and checks they touch the analysis box
(81.9 to 84.0 E, 25.4 to 28.0 N). If a tile's longitude/latitude bounds fall far outside the box, or its CRS is missing, the scoring would have been wrong."""
import pathlib, re, sys
import rasterio
from rasterio.warp import transform_bounds
sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "data/external/flood_observed/gfm")
BOX = (81.9, 25.4, 84.0, 28.0)
if not ROOT.exists(): sys.exit(f"STOP: {ROOT} not found.")
tiles = {}
for p in ROOT.rglob("*.tif"):
    m = re.search(r"(E\d{3}N\d{3}T\d)", p.name) or re.search(r"(E\d{3}N\d{3}T\d)", str(p))
    tiles.setdefault(m.group(1) if m else p.parent.name, p)
print(f"{len(tiles)} different tile ids found under {ROOT}; showing up to 4")
bad = 0; touching = 0; shown = 0
for tid, p in list(sorted(tiles.items()))[:4]:
    try:
        with rasterio.open(p) as ds:
            crs = ds.crs
            print(f"\nTile {tid}\n  file: {p}\n  size: {ds.width} x {ds.height}, pixel: {ds.res}, dtype {ds.dtypes[0]}")
            if crs is None: print("  CRS: MISSING  <-- problem"); bad += 1; continue
            print("  CRS:", crs.to_string()[:150], "| geographic" if crs.is_geographic else "| projected (metres)")
            print("  native bounds:", tuple(round(v, 1) for v in ds.bounds))
            w, s, e, n = transform_bounds(crs, "EPSG:4326", *ds.bounds)
            print(f"  lon/lat bounds: {w:.2f} to {e:.2f} E, {s:.2f} to {n:.2f} N")
            hit = not (e < BOX[0] or w > BOX[2] or n < BOX[1] or s > BOX[3])
            print("  touches the analysis box:", "yes" if hit else "no (a neighbouring tile is fine)"); touching += hit; shown += 1
    except Exception as ex:
        print(f"\nTile {tid}: could not read {p.name}: {ex}"); bad += 1
print("\nRESULT:", (f"{shown} tile(s) read, all have a CRS and convert to longitude/latitude; {touching} touch the analysis box. A projected metre CRS must be reprojected before it is compared with the 4326 HAND grid (the scoring script does this)." if not bad else f"{bad} problem(s) above; send me the output"))
