"""Patch 22b: two questions from the visual check. Reads only. Run from the repo root:  uv run python -I etl/checks/sdg_seam_check.py
1. The straight cut at 27.0 N in the Gonda picture: is it in the DEM, or only in the river-height layer?
2. Schools and health facilities per 0.5 degree piece of the OSM download (India looked almost empty of schools, Nepal very full)."""
import glob, json, os, sys
from pathlib import Path
import numpy as np
import rasterio

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(os.environ.get("DEM_ROOT") or Path(__file__).resolve().parents[2])
RASTERS = {"DEM raw": ROOT / "data/final/corrected_rasters/raw_dem_2022.tif", "DEM corrected": ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif",
           "HAND raw": ROOT / "data/processed/sdg/hand/hand_raw_2022.tif", "HAND corrected": ROOT / "data/processed/sdg/hand/hand_corrected_2022.tif"}


def strip(path, lon0, lon1, lat0, lat1):
    with rasterio.open(path) as s:
        r0, c0 = s.index(lon0, lat1); r1, c1 = s.index(lon1, lat0)
        a = s.read(1, window=((r0, r1 + 1), (c0, c1 + 1))).astype("float64")
        a[(a <= -9990) | ~np.isfinite(a)] = np.nan
        return a, s.transform.e


def main():
    print("== 1. Seam near 27.0 N, strip lon 82.0 to 82.3 ==")
    for name, p in RASTERS.items():
        if not p.exists():
            print(f"{name}: file not found ({p})"); continue
        a, e = strip(p, 82.0, 82.3, 26.96, 27.04)
        step = max(1, int(round(0.004 / abs(e)))); rows = a.shape[0]
        print(f"\n{name}: mean per 0.004-degree row, north to south (lat, mean, share of cells with no value)")
        for i in range(0, rows, step):
            blk = a[i:i + step]
            lat = 27.04 - (i + step / 2) * abs(e)
            print(f"  {lat:.3f}  {np.nanmean(blk) if np.isfinite(blk).any() else float('nan'):9.2f}  nodata {100*np.mean(~np.isfinite(blk)):5.1f}%")
        if "HAND" in name:
            up, _ = strip(p, 82.0, 82.3, 27.0, 27.04); dn, _ = strip(p, 82.0, 82.3, 26.96, 27.0)
            print(f"  share <= 2 m: north of 27.0 = {100*np.nanmean(up <= 2):.1f}%, south of 27.0 = {100*np.nanmean(dn <= 2):.1f}%")
    print("\n== 2. OSM schools and health facilities per 0.5 degree piece ==")
    seen, grid = set(), {}
    for p in glob.glob(str(ROOT / "data/external/osm/osm_*.json")):
        for el in json.load(open(p, encoding="utf-8")).get("elements", []):
            k = (el.get("type"), el.get("id"))
            if k in seen: continue
            seen.add(k)
            am = (el.get("tags") or {}).get("amenity")
            kind = "school" if am in ("school", "college", "university") else "health" if am in ("hospital", "clinic") else None
            if not kind: continue
            if "lat" in el: la, lo = el["lat"], el["lon"]
            elif el.get("geometry"): la, lo = el["geometry"][0]["lat"], el["geometry"][0]["lon"]
            else: continue
            g = grid.setdefault((int(np.floor(la * 2)) / 2, int(np.floor(lo * 2)) / 2), {"school": 0, "health": 0}); g[kind] += 1
    print("south-west corner of the piece (lat, lon): schools, health")
    for (la, lo), g in sorted(grid.items(), reverse=True):
        print(f"  {la:5.1f} {lo:5.1f}: schools {g['school']:4d}, health {g['health']:4d}")
    print(f"\nfiles read: {len(glob.glob(str(ROOT / 'data/external/osm/osm_*.json')))}. Send this whole output back.")


main()
