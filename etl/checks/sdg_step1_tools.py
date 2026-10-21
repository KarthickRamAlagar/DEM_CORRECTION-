import sys, importlib, glob
sys.stdout.reconfigure(encoding="utf-8")
for m in ["rasterio","geopandas","shapely","pyproj","scipy","pysheds","whitebox","richdem","rioxarray","psutil","skimage"]:
    try:
        mod = importlib.import_module(m)
        print(f"{m:10s} OK  {getattr(mod,'__version__','')}")
    except Exception as e:
        print(f"{m:10s} MISSING")
try:
    import psutil
    print("RAM total GB:", round(psutil.virtual_memory().total/1e9,1), "| free GB:", round(psutil.virtual_memory().available/1e9,1))
except Exception:
    pass
print("\nOSM files:")
for p in sorted(glob.glob("C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/osm/**/*", recursive=True))[:25]:
    print(" ", p.split("external/")[-1])
