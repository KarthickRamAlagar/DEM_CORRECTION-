import sys, shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from dem_correction.fetchers.sentinel2 import fetch_and_mosaic_year, compute_ndvi_from_mosaics
from dem_correction.config import DATA_RAW, STUDY_BBOX

MIN_FREE_GB = 35
disk = Path(DATA_RAW).resolve()
for year in range(2022, 2027):
    out = DATA_RAW / "sentinel2" / str(year)
    done = len(list(out.glob("*_mosaic.tif"))) if out.exists() else 0
    free = shutil.disk_usage(disk).free / 1e9
    print(f"--- Year {year}: {done} mosaics on disk, {free:.1f} GB free ---", flush=True)
    if done >= 6:
        print(f"  Year {year}: mosaics already exist, skipping.", flush=True)
        continue
    if free < MIN_FREE_GB:
        print(f"  STOPPING before {year}: only {free:.1f} GB free (need {MIN_FREE_GB}). Free space, then rerun.", flush=True)
        break
    mosaics = fetch_and_mosaic_year(STUDY_BBOX, year, out)
    if mosaics:
        try:
            compute_ndvi_from_mosaics(mosaics)
        except Exception as e:
            print(f"    SKIPPED sanity check: {e}", flush=True)
print("Guarded run ended.", flush=True)
