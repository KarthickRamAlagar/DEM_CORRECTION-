"""Nearest-channel HAND (height above nearest channel), raw vs corrected DEM.
Reads: raw/corrected 2022 DEM rasters, OSM waterway lines. Writes ONLY to data/processed/sdg/hand/.
Channels = OSM waterway river+stream (canals only with --canals). Not a flow-path HAND."""
import sys, os, json, glob, time, argparse, shutil
import numpy as np
import rasterio
from rasterio import Affine
from rasterio.windows import Window, transform as wtransform
from rasterio.features import rasterize
from shapely.geometry import LineString, box
from shapely.strtree import STRtree
from scipy.ndimage import distance_transform_edt, minimum_filter

sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
RAW = ROOT + "data/final/corrected_rasters/raw_dem_2022.tif"
COR = ROOT + "data/final/corrected_rasters/corrected_dem_2022.tif"
OUT = ROOT + "data/processed/sdg/hand/"
BOX = (81.9, 25.4, 84.0, 28.0)   # analysis box W,S,E,N (overlap of DEM and OSM fetch)
TILE, BUF, NODATA = 1500, 400, -9999.0
THR = [1, 2, 3, 5, 10]

ap = argparse.ArgumentParser()
ap.add_argument("--mode", choices=["test", "full"], required=True)
ap.add_argument("--canals", action="store_true")
ap.add_argument("--overwrite", action="store_true")
args = ap.parse_args()
kinds = {"river", "stream"} | ({"canal"} if args.canals else set())
suffix = "_with_canals" if args.canals else ""

seen, lines = set(), []
for p in glob.glob(ROOT + "data/external/osm/osm_*.json"):
    for e in json.load(open(p, encoding="utf-8"))["elements"]:
        t = e.get("tags") or {}
        if e.get("type") == "way" and t.get("waterway") in kinds and e["id"] not in seen:
            g = e.get("geometry")
            if g and len(g) >= 2:
                seen.add(e["id"])
                lines.append(LineString([(q["lon"], q["lat"]) for q in g]))
print("channel lines (unique):", len(lines), "| kinds:", sorted(kinds))
tree = STRtree(lines)

srcR, srcC = rasterio.open(RAW), rasterio.open(COR)
T, W, H = srcR.transform, srcR.width, srcR.height
assert srcC.transform == T and srcC.width == W and srcC.height == H, "raw/corrected grids differ"
col0 = max(0, int(round((BOX[0] - T.c) / T.a))); col1 = min(W, int(round((BOX[2] - T.c) / T.a)))
row0 = max(0, int(round((T.f - BOX[3]) / (-T.e)))); row1 = min(H, int(round((T.f - BOX[1]) / (-T.e))))
OW, OH = col1 - col0, row1 - row0
print(f"analysis window: {OW} x {OH} cells ({OW*OH/1e6:.1f} M)")

def hand_tile(r, c):
    cr0, cc0 = row0 + r, col0 + c
    ch, cw = min(TILE, row1 - cr0), min(TILE, col1 - cc0)
    br0, bc0 = max(0, cr0 - BUF), max(0, cc0 - BUF)
    br1, bc1 = min(H, cr0 + ch + BUF), min(W, cc0 + cw + BUF)
    bwin = Window(bc0, br0, bc1 - bc0, br1 - br0)
    bt = wtransform(bwin, T)
    bh, bw = int(bwin.height), int(bwin.width)
    left, top = bt * (0, 0); right, bottom = bt * (bw, bh)
    sl = (slice(cr0 - br0, cr0 - br0 + ch), slice(cc0 - bc0, cc0 - bc0 + cw))
    ids = tree.query(box(left, bottom, right, top))
    empty = np.full((ch, cw), np.nan, dtype="float32")
    if len(ids) == 0:
        return empty, empty.copy(), 0.0
    mask = rasterize([(lines[i], 1) for i in ids], out_shape=(bh, bw), transform=bt,
                     fill=0, dtype="uint8", all_touched=True).astype(bool)
    if not mask.any():
        return empty, empty.copy(), 0.0
    dist, inds = distance_transform_edt(~mask, return_indices=True)
    ir, ic = inds[0], inds[1]
    far = dist > BUF
    outs = []
    for src in (srcR, srcC):
        a = src.read(1, window=bwin).astype("float32")
        if src.nodata is not None:
            a[a == src.nodata] = np.nan
        af = np.where(np.isnan(a), np.inf, a)
        lo = minimum_filter(af, size=5, mode="nearest")
        lo[np.isinf(lo)] = np.nan
        h = a - lo[ir, ic]
        h[far] = np.nan
        outs.append(h[sl].astype("float32"))
    return outs[0], outs[1], float(mask[sl].mean())

def accum(st, h):
    with np.errstate(invalid="ignore"):
        v = np.isfinite(h)
        st["valid"] += int(v.sum()); st["neg"] += int((h[v] < 0).sum())
        for t in THR:
            st[t] += int((h[v] <= t).sum())

def new_stats():
    d = {"valid": 0, "neg": 0}; d.update({t: 0 for t in THR}); return d

def show(name, st):
    v = max(st["valid"], 1)
    print(f"{name}: valid cells {st['valid']:,} | negative HAND {100*st['neg']/v:.1f}% | " +
          " | ".join(f"<= {t} m: {100*st[t]/v:.1f}%" for t in THR))

t0 = time.time()
if args.mode == "test":
    rc = int(round((T.f - 25.70) / (-T.e))); cc = int(round((82.35 - T.c) / T.a))
    r = max(0, min(rc - row0 - TILE // 2, OH - TILE)); c = max(0, min(cc - col0 - TILE // 2, OW - TILE))
    hr, hc, share = hand_tile(r, c)
    print(f"\nTEST window rows {r}-{r+TILE}, cols {c}-{c+TILE} | channel cells in window: {100*share:.2f}%")
    for name, h in (("raw", hr), ("corrected", hc)):
        v = h[np.isfinite(h)]
        if v.size:
            p = np.percentile(v, [5, 50, 95])
            print(f"{name:9s} HAND percentiles 5/50/95 (m): {p[0]:.2f} / {p[1]:.2f} / {p[2]:.2f}")
    both = np.isfinite(hr) & np.isfinite(hc)
    if both.any():
        d = (hc - hr)[both]
        print(f"corrected - raw HAND: mean {d.mean():.3f} m, std {d.std():.3f} m, valid cells {both.sum():,}")
    for name, h in (("raw", hr), ("corrected", hc)):
        st = new_stats(); accum(st, h); show(name, st)
    print(f"\ntest took {time.time()-t0:.1f} s (full run = 42 windows)")
else:
    free = shutil.disk_usage(ROOT + "data/processed").free / 1e9
    print(f"free space: {free:.1f} GB")
    if free < 3:
        sys.exit("less than 3 GB free - stopping")
    pr, pc = OUT + f"hand_raw_2022{suffix}.tif", OUT + f"hand_corrected_2022{suffix}.tif"
    if (os.path.exists(pr) or os.path.exists(pc)) and not args.overwrite:
        sys.exit("output exists - use --overwrite after you check it")
    prof = dict(driver="GTiff", height=OH, width=OW, count=1, dtype="float32", crs=srcR.crs,
                transform=T * Affine.translation(col0, row0), nodata=NODATA, compress="lzw",
                tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
    stR, stC = new_stats(), new_stats()
    with rasterio.open(pr, "w", **prof) as dR, rasterio.open(pc, "w", **prof) as dC:
        n = 0; total = ((OH + TILE - 1) // TILE) * ((OW + TILE - 1) // TILE)
        for r in range(0, OH, TILE):
            for c in range(0, OW, TILE):
                ts = time.time()
                hr, hc, share = hand_tile(r, c)
                win = Window(c, r, hr.shape[1], hr.shape[0])
                dR.write(np.where(np.isfinite(hr), hr, NODATA).astype("float32"), 1, window=win)
                dC.write(np.where(np.isfinite(hc), hc, NODATA).astype("float32"), 1, window=win)
                accum(stR, hr); accum(stC, hc); n += 1
                print(f"tile {n}/{total} done in {time.time()-ts:.1f} s (channel cells {100*share:.2f}%)", flush=True)
    print(); show("raw", stR); show("corrected", stC)
    print(f"\nfull run took {(time.time()-t0)/60:.1f} min -> {OUT}")
