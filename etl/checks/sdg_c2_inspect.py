import sys, os, glob
sys.stdout.reconfigure(encoding="utf-8")
import rasterio
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/"
def size(p): return os.path.getsize(p) / 1e6
for folder in ("population", "landcover", "buildings", "crops", "health_facilities"):
    print(f"\n===== {folder} =====")
    files = [p for p in glob.glob(base + folder + "/**/*", recursive=True) if os.path.isfile(p)]
    print("files:", len(files), "| total MB:", round(sum(size(p) for p in files), 1))
    exts = {}
    for p in files: exts[os.path.splitext(p)[1].lower()] = exts.get(os.path.splitext(p)[1].lower(), 0) + 1
    print("types:", exts)
    shown = 0
    for p in sorted(files):
        e = os.path.splitext(p)[1].lower(); rel = p.split("external/")[-1]
        try:
            if e in (".tif", ".tiff"):
                with rasterio.open(p) as r:
                    print(f"  TIF {rel} | {size(p):.0f} MB | {r.width}x{r.height} | res {tuple(round(x,6) for x in r.res)} | crs {r.crs} | dtype {r.dtypes[0]} | nodata {r.nodata} | bounds {tuple(round(x,2) for x in r.bounds)}")
                    shown += 1
            elif e == ".parquet":
                import pyarrow.parquet as pq
                pf = pq.ParquetFile(p)
                print(f"  PARQUET {rel} | {size(p):.0f} MB | rows {pf.metadata.num_rows:,} | cols {[f.name for f in pf.schema_arrow][:12]}")
                shown += 1
            elif e in (".csv", ".json", ".geojson", ".gpkg", ".shp", ".zip", ".md", ".txt", ".pdf") and shown < 14:
                print(f"  {e[1:].upper()} {rel} | {size(p):.1f} MB"); shown += 1
        except Exception as ex:
            print(f"  cannot read {rel}: {type(ex).__name__}")
        if shown >= 14: print("  ... (more files not listed)"); break
