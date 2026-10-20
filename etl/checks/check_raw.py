import glob, os
import numpy as np, rasterio
import pyarrow.parquet as pq

def chk(path):
    try:
        with rasterio.open(path) as ds:
            h, w = ds.height, ds.width
            f = max(1, max(h, w) // 800)
            a = ds.read(1, out_shape=(h // f, w // f)).astype("float64")
            nd = ds.nodata
            bad = ~np.isfinite(a)
            if nd is not None:
                bad |= (a == nd)
            v = a[~bad]
            if v.size == 0:
                return f"BAD all-nodata  {path}"
            return (f"OK  {os.path.relpath(path)}  {w}x{h} {ds.dtypes[0]}  "
                    f"nodata/NaN={bad.mean()*100:.1f}%  zero={(a==0).mean()*100:.1f}%  "
                    f"min={v.min():.3g} max={v.max():.3g} mean={v.mean():.3g}")
    except Exception as e:
        return f"BAD cannot open {path}: {e}"

groups = {
  "Sentinel-2 mosaics": sorted(glob.glob("data/raw/sentinel2/*/*_mosaic.tif")),
  "Sentinel-1 mosaics": sorted(glob.glob("data/raw/sentinel1/**/*mosaic*.tif", recursive=True)),
  "DEM mosaics": sorted(glob.glob("data/raw/dem/**/*mosaic*.tif", recursive=True) + glob.glob("data/interim/*mosaic*.tif")),
}
for name, files in groups.items():
    print(f"\n== {name}: {len(files)} files")
    for f in files:
        print(" ", chk(f))

tiles = glob.glob("data/raw/dem/cartodem_tiles/*.tif")
print(f"\n== CartoDEM tiles: {len(tiles)} (want 12)")

files = sorted(glob.glob("data/raw/icesat2/points_by_granule/*.parquet"))
rows = 0; bad = 0
for f in files:
    try:
        rows += pq.ParquetFile(f).metadata.num_rows
    except Exception:
        bad += 1; print("  BAD", f)
dates = sorted(os.path.basename(f)[6:14] for f in files)
print(f"\n== ICESat-2 granules: {len(files)} files, unreadable={bad}, rows={rows:,}")
print(f"   dates {dates[0]} to {dates[-1]} (old Golden window ended 2023-02-27; old raw rows were 1,221,358)")
