"""
ICESat-2 Density Checkpoint Script

THIS IS THE MOST IMPORTANT SCRIPT IN YOUR PIPELINE SO FAR.

It answers the question: "How many real, usable ICESat-2 ground-truth
points actually exist in my study region, across my full date range?"

This determines whether your 1,00,000+ row target is realistic for
one region (Gangetic Plains) or whether you'll need a second region.

Run: uv run python scripts/check_icesat2_density.py
"""

import sys
from pathlib import Path

# allow importing from src/ without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.icesat2 import (
    login,
    search_atl08_granules,
    download_sample_granules,
    extract_points_from_atl08,
)
from dem_correction.config import DATA_RAW

N_SAMPLE_GRANULES = 15  # small enough to be fast, spread across the full time range


def main():
    print("=" * 70)
    print("ICESAT-2 DENSITY CHECKPOINT")
    print("=" * 70)

    # Step 1: Authenticate
    login()

    # Step 2: Search the FULL date range (this is the real count, not a sample)
    all_granules = search_atl08_granules()
    total_granule_count = len(all_granules)

    if total_granule_count == 0:
        print("STOP: 0 granules found for the full date range.")
        print("This likely means the bounding box or date range in config.py")
        print("needs to be double-checked before proceeding further.")
        return

    # Step 3: Download a small, spread-out sample to estimate density
    sample_dir = DATA_RAW / "icesat2" / "density_check_sample"
    sample_dir.mkdir(parents=True, exist_ok=True)

    sample_files = download_sample_granules(
        all_granules, N_SAMPLE_GRANULES, str(sample_dir)
    )

    # Step 4: Extract real points from each sample file, count them
    print("Extracting points from sample granules...")
    points_per_granule = []
    for filepath in sample_files:
        df = extract_points_from_atl08(filepath)
        points_per_granule.append(len(df))
        print(f"  {Path(filepath).name}: {len(df)} usable points")

    avg_points_per_granule = sum(points_per_granule) / len(points_per_granule)

    # Step 5: Extrapolate to the full date range
    estimated_total_points = avg_points_per_granule * total_granule_count

    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"Total granules found (full date range): {total_granule_count}")
    print(f"Sample granules downloaded and checked:  {len(sample_files)}")
    print(f"Average usable points per granule:       {avg_points_per_granule:.1f}")
    print(f"ESTIMATED TOTAL USABLE POINTS:           {estimated_total_points:,.0f}")
    print("=" * 70)

    print("\nWhat this means:")
    if estimated_total_points >= 100_000:
        print(f"  GOOD: Estimated {estimated_total_points:,.0f} points clears your")
        print(f"  1,00,000+ row target for Gangetic Plains alone.")
        print(f"  You likely do NOT need a second region for row count purposes.")
    else:
        shortfall = 100_000 - estimated_total_points
        print(f"  WARNING: Estimated {estimated_total_points:,.0f} points falls short")
        print(f"  of your 1,00,000+ target by about {shortfall:,.0f} points.")
        print(f"  Consider: adding a second region, relaxing the quality filter")
        print(f"  slightly, or accepting a lower row count with honest justification.")

    print("\nNote: this is an ESTIMATE based on a sample of")
    print(f"{N_SAMPLE_GRANULES} granules. The real number will vary once you")
    print("process all granules for the final dataset - but this gives you")
    print("a realistic order-of-magnitude answer before committing further time.")


if __name__ == "__main__":
    main()