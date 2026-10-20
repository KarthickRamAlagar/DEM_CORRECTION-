"""
Run Reproject/Align Step (Stage 7)

Aligns everything you've fetched onto ONE common pixel grid:
- CartoDEM mosaic (primary baseline)
- Copernicus DEM mosaic (secondary baseline)
- Sentinel-1 yearly mosaics (2022-2026, VV+VH)
- Sentinel-2 yearly per-band mosaics (2022-2026, 6 bands each)

Run: uv run python scripts/run_reproject.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.processing.reproject import (
    reproject_raster_to_reference,
    verify_alignment,
)
from dem_correction.config import DATA_RAW, DATA_INTERIM

ALIGNED_DIR = DATA_INTERIM / "aligned"

YEARS = range(2022, 2024)
S2_BANDS = ["B02", "B03", "B04", "B08", "B11", "B12"]


def main():
    print("=" * 60)
    print("REPROJECT / ALIGN ALL RASTERS TO COMMON GRID")
    print("=" * 60)

    aligned_paths = []

    # --- DEM (both baselines) ---
    print("\n--- DEM ---")
    dem_jobs = [
        (DATA_INTERIM / "cartodem_mosaic.tif", ALIGNED_DIR / "cartodem_aligned.tif"),
        (DATA_INTERIM / "copernicus_dem_mosaic.tif", ALIGNED_DIR / "copernicus_dem_aligned.tif"),
    ]
    for src, dst in dem_jobs:
        if not src.exists():
            print(f"  SKIPPED (source not found): {src}")
        elif dst.exists():
            print(f"  Already aligned, skipping: {dst.name}")
            aligned_paths.append(dst)
        else:
            print(f"  Aligning {src.name} -> {dst.name}")
            reproject_raster_to_reference(src, dst)
            aligned_paths.append(dst)

    # --- Sentinel-1 (yearly VV+VH mosaics) ---
    print("\n--- Sentinel-1 ---")
    for year in YEARS:
        src = DATA_RAW / "sentinel1" / str(year) / f"s1_vv_vh_{year}_mosaic.tif"
        dst = ALIGNED_DIR / "sentinel1" / f"s1_{year}_aligned.tif"
        if src.exists():
            if dst.exists():
                print(f"  Already aligned, skipping: {dst.name}")
            else:
                print(f"  Aligning {src.name} -> {dst.name}")
                reproject_raster_to_reference(src, dst)
            aligned_paths.append(dst)
        else:
            print(f"  SKIPPED (not found): {src}")

    # --- Sentinel-2 (yearly per-band mosaics) ---
    print("\n--- Sentinel-2 ---")
    for year in YEARS:
        for band in S2_BANDS:
            src = DATA_RAW / "sentinel2" / str(year) / f"{year}_{band}_mosaic.tif"
            dst = ALIGNED_DIR / "sentinel2" / f"s2_{year}_{band}_aligned.tif"
            if src.exists():
                if dst.exists():
                    pass  # already aligned, skip silently (per-band, keep output quiet)
                else:
                    reproject_raster_to_reference(src, dst)
                aligned_paths.append(dst)
            else:
                print(f"  SKIPPED (not found): {src}")
        print(f"  Year {year}: aligned {len(S2_BANDS)} bands")

    # --- Verify everything actually lines up ---
    print("\n" + "=" * 60)
    all_ok = verify_alignment(aligned_paths)
    print("=" * 60)

    if all_ok:
        print(f"\nDone. {len(aligned_paths)} rasters aligned to the common grid.")
        print("Ready to proceed to features.py")
    else:
        print("\nFix alignment issues before proceeding to features.py")


if __name__ == "__main__":
    main()