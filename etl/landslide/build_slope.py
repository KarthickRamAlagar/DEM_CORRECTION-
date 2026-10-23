"""Patch 15, step 1: slope rasters (degrees, 0-90, uint8, 255 = no data) from the raw and the corrected DEM.
Reads data/final/corrected_rasters/raw_dem_2022.tif and corrected_dem_2022.tif; writes data/processed/sdg/landslide/slope_raw_deg.tif and slope_corrected_deg.tif. Changes nothing else.
  uv run python -I etl/landslide/build_slope.py                 (a few minutes; reads in strips, so memory stays small)"""
import argparse, sys, time
from pathlib import Path
import numpy as np, rasterio
from rasterio.windows import Window
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from slope_tools import horn_slope, cell_m
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / "data" / "processed" / "sdg" / "landslide"

def build(src, dst, strip=1024):
    with rasterio.open(src) as r:
        prof = r.profile.copy(); prof.update(dtype="uint8", count=1, nodata=255, compress="deflate", tiled=True, blockxsize=256, blockysize=256, predictor=2)
        geo = bool(r.crs and r.crs.is_geographic); H, W = r.height, r.width; tr = r.transform
        with rasterio.open(dst, "w", **prof) as w:
            for y0 in range(0, H, strip):
                y1 = min(H, y0 + strip); ya, yb = max(0, y0 - 1), min(H, y1 + 1)
                a = r.read(1, window=Window(0, ya, W, yb - ya), masked=True).astype("float64").filled(np.nan)
                lat = tr.f + (np.arange(ya, yb) + 0.5) * tr.e; dx, dy = cell_m(abs(tr.a), abs(tr.e), lat, geo)
                s = horn_slope(a, dx, dy)[y0 - ya: y0 - ya + (y1 - y0)]
                q = np.where(np.isfinite(s), np.clip(np.rint(s), 0, 90), 255).astype("uint8"); w.write(q, 1, window=Window(0, y0, W, y1 - y0))
    return dst

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--raw", default=str(ROOT / "data/final/corrected_rasters/raw_dem_2022.tif")); ap.add_argument("--corrected", default=str(ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif"))
    ap.add_argument("--out", default=str(OUT)); a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for tag, src in (("raw", a.raw), ("corrected", a.corrected)):
        if not Path(src).exists(): sys.exit(f"STOP: {src} not found. Nothing written for it.")
        t = time.time(); d = build(src, out / f"slope_{tag}_deg.tif"); print(f"{tag}: wrote {d} in {time.time()-t:.0f} s")
