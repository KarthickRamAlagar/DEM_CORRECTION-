"""
Check Disk Usage and Clean Up Raw Intermediates

Once mosaics/aligned rasters exist, the raw per-scene (Sentinel-2) and
per-tile (Sentinel-1) files that were used to BUILD those mosaics are
no longer needed - they were intermediate inputs, not the final product.

Run with --check first to see sizes WITHOUT deleting anything.
Run with --clean to actually delete the raw intermediates.

Run: uv run python scripts/cleanup_raw_intermediates.py --check
     uv run python scripts/cleanup_raw_intermediates.py --clean
"""

import sys
import shutil
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_RAW


def get_size_gb(path):
    if not path.exists():
        return 0.0
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return total / 1e9


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Show sizes only, delete nothing")
    parser.add_argument("--clean", action="store_true", help="Actually delete raw intermediates")
    args = parser.parse_args()

    if not args.check and not args.clean:
        print("Specify --check (safe, shows sizes) or --clean (deletes raw intermediates)")
        return

    print("=" * 60)
    print("DISK USAGE - RAW INTERMEDIATE FILES")
    print("=" * 60)

    targets = []

    # Sentinel-2: per-scene folders (each named after a scene ID, containing
    # B02.tif etc.) - these fed into the *_mosaic.tif files, now redundant
    s2_dir = DATA_RAW / "sentinel2"
    if s2_dir.exists():
        for year_dir in sorted(s2_dir.iterdir()):
            if not year_dir.is_dir():
                continue
            for scene_dir in year_dir.iterdir():
                # skip the mosaic files themselves (named like 2022_B02_mosaic.tif)
                # and any "reprojected_*" intermediate files - only target real
                # per-scene folders
                if scene_dir.is_dir() and not scene_dir.name.startswith("reprojected"):
                    size = get_size_gb(scene_dir)
                    targets.append((scene_dir, size))

    # Sentinel-1: raw tile folders (per-year "tiles" subfolder) - fed into
    # the *_mosaic.tif files, now redundant
    s1_dir = DATA_RAW / "sentinel1"
    if s1_dir.exists():
        for year_dir in sorted(s1_dir.iterdir()):
            if not year_dir.is_dir():
                continue
            tiles_dir = year_dir / "tiles"
            if tiles_dir.exists():
                size = get_size_gb(tiles_dir)
                targets.append((tiles_dir, size))

    total_size = sum(size for _, size in targets)

    print(f"\nFound {len(targets)} raw intermediate folders (scenes/tiles):")
    for path, size in sorted(targets, key=lambda x: -x[1])[:20]:
        print(f"  {size:6.2f} GB  {path}")
    if len(targets) > 20:
        print(f"  ... and {len(targets) - 20} more")

    print(f"\nTOTAL RECLAIMABLE: {total_size:.2f} GB")

    if args.clean:
        print("\nDeleting...")
        for path, size in targets:
            shutil.rmtree(path, ignore_errors=True)
        print(f"Deleted {len(targets)} folders, freed approximately {total_size:.2f} GB.")
    else:
        print("\n(This was --check only, nothing was deleted. Run with --clean to delete.)")


if __name__ == "__main__":
    main()