"""Score HAND<=threshold (raw vs corrected DEM) against GFM observed flood, per scene-tile item, at 100 m.
Writes only small count tables to data/processed/sdg/flood_eval/. Valid pixel = observed (flood!=255) AND exclusion==0 AND ref_water!=1
(strict variant also drops ref_water==2). Exclusion/ref-water meanings are INFERRED from data patterns, not documentation."""
import sys, os, time, argparse
from functools import lru_cache
import numpy as np, pandas as pd, rasterio
from rasterio import Affine
from rasterio.warp import reproject, Resampling

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
GFM = ROOT + "data/external/flood_observed/gfm/"
HANDF = {"raw": ROOT + "data/processed/sdg/hand/hand_raw_2022.tif",
         "corrected": ROOT + "data/processed/sdg/hand/hand_corrected_2022.tif"}
OUTDIR = ROOT + "data/processed/sdg/flood_eval/"
DEC = 5
TH = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20]

ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=0, help="test: only first N items, writes item_counts_test.csv")
ap.add_argument("--resume", action="store_true")
args = ap.parse_args()
OUT = OUTDIR + ("item_counts_test.csv" if args.limit else "item_counts.csv")

df = pd.read_csv(GFM + "items.csv")
df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
df["day"] = df["datetime"].dt.strftime("%Y-%m-%d")
df["flag"] = df["anomaly_detected"].astype(str)
df = df.sort_values(["reference_water", "datetime"]).reset_index(drop=True)
if args.limit:
    df = df.head(args.limit)
    if os.path.exists(OUT): os.remove(OUT)
done = set()
if os.path.exists(OUT):
    if not args.resume:
        sys.exit("results exist - use --resume to continue (nothing overwritten)")
    done = set(pd.read_csv(OUT, usecols=["id"])["id"])
    print("already done:", len(done))
todo = df[~df["id"].isin(done)]
print("items to score:", len(todo), "of", len(df))

def P(rel): return GFM + str(rel).replace("\\", "/")

# per-tile 100 m grid + HAND resampled onto it (point sampling, nearest)
grid = {}
for tile in df["tile"].unique():
    first = df[df["tile"] == tile].iloc[0]
    with rasterio.open(P(first["flood_extent"])) as s:
        crs, tr, h, w = s.crs, s.transform * Affine.scale(DEC, DEC), s.height // DEC, s.width // DEC
    hh = {}
    for k, p in HANDF.items():
        dst = np.full((h, w), np.nan, dtype="float32")
        with rasterio.open(p) as hs:
            reproject(source=rasterio.band(hs, 1), destination=dst, dst_transform=tr, dst_crs=crs,
                      dst_nodata=np.nan, src_nodata=hs.nodata, resampling=Resampling.nearest)
        hh[k] = dst
    common = np.isfinite(hh["raw"]) & np.isfinite(hh["corrected"])
    grid[tile] = (hh, common)
    print(f"tile {tile}: HAND cells inside analysis box = {int(common.sum()):,}")

def rd(path, shape):
    with rasterio.open(path) as s:
        return s.read(1, out_shape=shape, resampling=Resampling.nearest)

@lru_cache(maxsize=6)
def refwater(path, shape): return rd(path, shape)

rows_all, errs, t0, n = [], 0, time.time(), 0
for _, it in todo.iterrows():
    n += 1
    hh, common = grid[it["tile"]]
    if not common.any(): continue
    shape = common.shape
    try:
        f = rd(P(it["flood_extent"]), shape); e = rd(P(it["exclusion_mask"]), shape)
        wtr = refwater(P(it["reference_water"]), shape)
    except Exception as ex:
        errs += 1; print("  skip", it["id"], type(ex).__name__); continue
    obs = (f != 255) & (e == 0) & common
    variants = {"main": obs & (wtr != 1), "strict": obs & (wtr != 1) & (wtr != 2)}
    for vn, vv in variants.items():
        fv = (f == 1) & vv
        nv, nf = int(vv.sum()), int(fv.sum())
        for dem in ("raw", "corrected"):
            for t in TH:
                p = (hh[dem] <= t) & vv
                tp = int((p & fv).sum()); fp = int(p.sum()) - tp; fn = nf - tp
                rows_all.append((it["id"], it["day"], it["tile"], it["flag"], vn, dem, t, tp, fp, fn, nv - tp - fp - fn, nv, nf))
    if n % 25 == 0 or n == len(todo):
        cols = ["id", "day", "tile", "flag", "variant", "dem", "t", "tp", "fp", "fn", "tn", "n_valid", "n_flood"]
        pd.DataFrame(rows_all, columns=cols).to_csv(OUT, mode="a", header=not os.path.exists(OUT), index=False)
        rows_all = []
        el = time.time() - t0
        print(f"{n}/{len(todo)} items | {el/60:.1f} min | ETA {(el/n)*(len(todo)-n)/60:.0f} min | skipped {errs}", flush=True)
print("finished ->", OUT)
