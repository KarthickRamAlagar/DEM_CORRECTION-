"""
Clean Corrupted Sentinel-2 Files

Scans every downloaded band file and checks if it's actually valid and
complete, not just present. Deletes any corrupted ones (leftovers from
crashes before the retry logic existed) so the next fetch run will
automatically re-download just the broken ones.

Run this ONCE now to clean up existing corruption, before re-running
fetch_sentinel2.py.

Run: uv run python scripts/clean_corrupted_tifs.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.sentinel2 import is_valid_geotiff
from dem_correction.config import DATA_RAW


def main():
    print("=" * 60)
    print("SCANNING FOR CORRUPTED SENTINEL-2 FILES")
    print("=" * 60)

    sentinel2_dir = DATA_RAW / "sentinel2"
    all_tifs = list(sentinel2_dir.rglob("*.tif"))

    print(f"Found {len(all_tifs)} .tif files to check...\n")

    corrupted = []
    for path in all_tifs:
        if not is_valid_geotiff(path):
            corrupted.append(path)
            print(f"  CORRUPTED: {path}")

    print(f"\n{len(corrupted)} corrupted file(s) found out of {len(all_tifs)} checked.")

    if corrupted:
        print("\nDeleting corrupted files (they will be re-downloaded automatically)...")
        for path in corrupted:
            path.unlink()
        print(f"Deleted {len(corrupted)} corrupted file(s).")
    else:
        print("No corruption found - all files are valid.")

    print("\nDone. Safe to re-run fetch_sentinel2.py now.")


if __name__ == "__main__":
    main()