"""
ICESat-2 ATL08 Fetcher (extended with batch processing)

Adds resumable, storage-safe batch processing on top of the original
search/extract functions:
- Processes one granule at a time: download -> extract points -> save
  small result -> DELETE the raw HDF5 file
- Skips granules already processed (safe to stop and restart anytime)
- Consolidates all small per-granule files into one final table at the end
"""

import time
from pathlib import Path

import earthaccess
import h5py
import numpy as np
import pandas as pd

from dem_correction.config import STUDY_BBOX, START_DATE, END_DATE


def login():
    """Authenticate with Earthdata. Uses saved credentials after first run."""
    auth = earthaccess.login(strategy="netrc", persist=True)
    if not auth.authenticated:
        auth = earthaccess.login(strategy="interactive", persist=True)
    if not auth.authenticated:
        raise RuntimeError("Earthdata authentication failed.")
    return auth


def search_atl08_granules(bbox=STUDY_BBOX, start_date=START_DATE, end_date=END_DATE):
    """Search ALL ATL08 granules over the study region and full date range."""
    print(f"Searching ATL08 granules...")
    print(f"  Bounding box: {bbox}")
    print(f"  Date range: {start_date} to {end_date}")

    results = earthaccess.search_data(
        short_name="ATL08",
        bounding_box=bbox,
        temporal=(start_date, end_date),
        count=-1,
    )

    print(f"  Found {len(results)} granules total.\n")
    return results


def extract_points_from_atl08(filepath, bbox=STUDY_BBOX):
    """
    Open one ATL08 HDF5 file and extract usable ground-truth points,
    clipped to the study bbox and quality-filtered.
    """
    west, south, east, north = bbox
    all_points = []

    with h5py.File(filepath, "r") as f:
        ground_tracks = ["gt1l", "gt1r", "gt2l", "gt2r", "gt3l", "gt3r"]

        for gt in ground_tracks:
            group = f"{gt}/land_segments"
            if group not in f:
                continue

            try:
                lat = f[f"{group}/latitude"][:]
                lon = f[f"{group}/longitude"][:]
                elev = f[f"{group}/terrain/h_te_best_fit"][:]
                quality = f[f"{group}/terrain_flg"][:]
            except KeyError:
                continue

            valid = (
                (elev > -1000) & (elev < 9000) &
                (quality == 0) &
                (lat >= south) & (lat <= north) &
                (lon >= west) & (lon <= east)
            )

            n_valid = np.sum(valid)
            if n_valid > 0:
                all_points.append(pd.DataFrame({
                    "latitude": lat[valid],
                    "longitude": lon[valid],
                    "elevation_ref": elev[valid],
                    "ground_track": gt,
                }))

    if not all_points:
        return pd.DataFrame(columns=["latitude", "longitude", "elevation_ref", "ground_track"])

    return pd.concat(all_points, ignore_index=True)


def get_processed_granule_ids(interim_dir):
    """
    Returns the set of granule IDs that already have a saved output file.
    Used to skip already-done work when resuming an interrupted run.
    """
    interim_dir = Path(interim_dir)
    if not interim_dir.exists():
        return set()
    return {p.stem for p in interim_dir.glob("*.parquet")}


def process_single_granule(granule, interim_dir, raw_tmp_dir, max_retries=3):
    """
    Download ONE granule, extract its points, save the small result,
    then delete the raw HDF5 file. Returns the number of points extracted.

    Retries on failure (network issues are common over a multi-hour run).
    """
    granule_id = granule["meta"]["native-id"]
    output_path = Path(interim_dir) / f"{granule_id}.parquet"

    for attempt in range(1, max_retries + 1):
        try:
            # Download just this one granule
            files = earthaccess.download([granule], str(raw_tmp_dir))
            if not files:
                raise RuntimeError("Download returned no files.")

            raw_filepath = Path(files[0])

            # Extract points
            df = extract_points_from_atl08(raw_filepath)
            df.to_parquet(output_path, index=False)

            # Delete the raw file immediately - this is what keeps
            # storage usage small across 1,727 granules
            raw_filepath.unlink(missing_ok=True)

            return len(df)

        except Exception as e:
            print(f"    Attempt {attempt}/{max_retries} failed for {granule_id}: {e}")
            if attempt < max_retries:
                time.sleep(5)  # brief pause before retry
            else:
                print(f"    GIVING UP on {granule_id} after {max_retries} attempts.")
                return None


def consolidate_all_points(interim_dir, final_path):
    """
    Combine every small per-granule parquet file into one final table.
    Run this after all granules are processed.
    """
    interim_dir = Path(interim_dir)
    files = list(interim_dir.glob("*.parquet"))

    if not files:
        print("No processed granule files found to consolidate.")
        return None

    print(f"Consolidating {len(files)} granule files into final table...")
    dfs = [pd.read_parquet(f) for f in files]
    combined = pd.concat(dfs, ignore_index=True)

    # Drop exact duplicate points (can happen if ground tracks overlap
    # at track intersections - rare but worth cleaning)
    before = len(combined)
    combined = combined.drop_duplicates(subset=["latitude", "longitude", "elevation_ref"])
    after = len(combined)
    if before != after:
        print(f"  Removed {before - after} exact duplicate points.")

    Path(final_path).parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(final_path, index=False)

    print(f"Final table saved: {final_path}")
    print(f"Total rows: {len(combined):,}")
    return combined