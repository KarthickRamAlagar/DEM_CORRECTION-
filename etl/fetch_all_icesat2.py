"""
Fetch ALL ICESat-2 Points - Full Batch Run

Processes every ATL08 granule in your study region and date range,
one at a time: download -> extract -> save -> delete raw file.

SAFE TO STOP AND RESTART: already-processed granules are automatically
skipped, so if this gets interrupted (closed laptop, network drop, etc.),
just run it again and it picks up where it left off.

Expected runtime: based on your density check (15 granules in ~115s),
1,727 granules will take roughly 3.5-4 hours. You do not need to
babysit this - start it and check back periodically.

Run: uv run python scripts/fetch_all_icesat2.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.fetchers.icesat2 import (
    login,
    search_atl08_granules,
    process_single_granule,
    get_processed_granule_ids,
    consolidate_all_points,
)
from dem_correction.config import DATA_RAW, DATA_INTERIM, DATA_FINAL

INTERIM_DIR = DATA_RAW / "icesat2" / "points_by_granule"
RAW_TMP_DIR = DATA_RAW / "icesat2" / "tmp_download"
FINAL_PATH = DATA_INTERIM / "icesat2_all_points.parquet"

LOG_EVERY_N = 25  # print a progress update every N granules


def main():
    print("=" * 70)
    print("FULL ICESAT-2 BATCH FETCH")
    print("=" * 70)

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    RAW_TMP_DIR.mkdir(parents=True, exist_ok=True)

    login()

    all_granules = search_atl08_granules()
    total = len(all_granules)

    already_done = get_processed_granule_ids(INTERIM_DIR)
    print(f"Already processed: {len(already_done)} / {total} granules")
    print(f"Remaining to process: {total - len(already_done)}\n")

    start_time = time.time()
    processed_this_run = 0
    total_points_this_run = 0
    failed_granules = []

    for i, granule in enumerate(all_granules, start=1):
        granule_id = granule["meta"]["native-id"]

        if granule_id in already_done:
            continue  # already processed in a previous run, skip

        point_count = process_single_granule(granule, INTERIM_DIR, RAW_TMP_DIR)

        if point_count is None:
            failed_granules.append(granule_id)
        else:
            processed_this_run += 1
            total_points_this_run += point_count

        if i % LOG_EVERY_N == 0 or i == total:
            elapsed_min = (time.time() - start_time) / 60
            print(f"[{i}/{total}] Processed this run: {processed_this_run} | "
                  f"Points this run: {total_points_this_run:,} | "
                  f"Elapsed: {elapsed_min:.1f} min | "
                  f"Failed: {len(failed_granules)}")

    print("\n" + "=" * 70)
    print("BATCH RUN COMPLETE")
    print("=" * 70)
    print(f"Processed this run: {processed_this_run}")
    print(f"Total points extracted this run: {total_points_this_run:,}")
    print(f"Failed granules: {len(failed_granules)}")
    if failed_granules:
        print("Failed granule IDs (re-run this script to retry them):")
        for gid in failed_granules:
            print(f"  {gid}")

    # Consolidate everything (all runs combined) into the final table
    print("\nConsolidating all processed granules into final table...")
    consolidate_all_points(INTERIM_DIR, FINAL_PATH)


if __name__ == "__main__":
    main()