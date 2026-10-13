"""
Diagnose Sentinel-1 Coverage Gap

Checks the ALIGNED Sentinel-1 raster directly (before merge.py touches
it) to confirm whether the 88% missing-data problem originates in the
original tiling/mosaicking, or somewhere later in the pipeline.

Run: uv run python scripts/diagnose_s1_gap.py
"""

import sys
from pathlib import Path

import numpy as np
import rasterio

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_INTERIM

ALIGNED_S1_DIR = DATA_INTERIM / "aligned" / "sentinel1"


def main():
    print("=" * 60)
    print("SENTINEL-1 ALIGNED RASTER COVERAGE CHECK")
    print("=" * 60)

    for year in range(2022, 2027):
        path = ALIGNED_S1_DIR / f"s1_{year}_aligned.tif"
        if not path.exists():
            print(f"\n{year}: file not found, skipping")
            continue

        with rasterio.open(path) as src:
            vv = src.read(1)
            nodata = src.nodata

            total_pixels = vv.size
            if nodata is not None:
                nan_or_nodata = np.sum((vv == nodata) | np.isnan(vv))
            else:
                nan_or_nodata = np.sum(np.isnan(vv))

            pct_missing = 100 * nan_or_nodata / total_pixels

            print(f"\n{year}:")
            print(f"  File nodata value: {nodata}")
            print(f"  Total pixels: {total_pixels:,}")
            print(f"  Missing/nodata pixels: {nan_or_nodata:,} ({pct_missing:.1f}%)")
            print(f"  VV value range (excluding nodata): "
                  f"{np.nanmin(vv[vv != nodata]) if nodata else np.nanmin(vv):.2f} to "
                  f"{np.nanmax(vv[vv != nodata]) if nodata else np.nanmax(vv):.2f}")


if __name__ == "__main__":
    main()