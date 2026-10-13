"""
Clean Up Invalid Sentinel-1 Data

Removes ALL previous Sentinel-1 outputs (raw tiles, mosaics, aligned
rasters) since they were built with the wrong units (linear power
instead of dB) and have real coverage gaps (tile seam misalignment).
Everything needs to be rebuilt from scratch with the fixed fetcher.

Run: uv run python scripts/cleanup_invalid_sentinel1.py
"""

import sys
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_RAW, DATA_INTERIM


def main():
    print("=" * 60)
    print("REMOVING INVALID SENTINEL-1 DATA")
    print("=" * 60)

    targets = [
        DATA_RAW / "sentinel1",
        DATA_INTERIM / "aligned" / "sentinel1",
    ]

    for path in targets:
        if path.exists():
            print(f"Removing: {path}")
            shutil.rmtree(path)
        else:
            print(f"Not found (already clean): {path}")

    print("\nDone. Also need to remove old feature/merge outputs that")
    print("included the bad Sentinel-1 data:")

    # These included Sentinel-1 features/values - must be rebuilt too
    stale_outputs = [
        DATA_INTERIM / "features",
        DATA_RAW.parent / "final" / "merged_by_year",
        DATA_RAW.parent / "final" / "integrated_dataset.parquet",
    ]
    for path in stale_outputs:
        if path.exists():
            print(f"  STALE (built using bad S1 data): {path}")

    print("\nRun this next if you're ready to fully rebuild from here:")
    print("  Remove-Item -Recurse -Force data\\interim\\features")
    print("  Remove-Item -Recurse -Force data\\final\\merged_by_year")
    print("  Remove-Item -Force data\\final\\integrated_dataset.parquet")


if __name__ == "__main__":
    main()