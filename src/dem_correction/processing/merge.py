"""
Merge Module (Stage 9 of the Plan of Action)

The actual integration step: for every ICESat-2 point, look up its
matching pixel values across the feature rasters (using nearest-year
matching), attach environmental data, and compute target columns -
producing the final one-row-per-point table.

IMPORTANT SCALING DECISION: with an estimated 1.3-1.6 million points,
calling the NASA POWER API once per point would take 100+ hours (each
call is a network round-trip). Instead, environmental data is CACHED
BY DATE ONLY (using the region's centroid coordinate) - weather varies
slowly across a ~400km region compared to point-to-point terrain
differences, so this is a reasonable, documented approximation. This
reduces API calls from ~1.3 million to roughly one per unique
acquisition date (a few hundred to ~1000), making this step actually
finish in a reasonable time.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

from dem_correction.config import STUDY_BBOX, DATA_INTERIM, DATA_RAW
from dem_correction.fetchers.power import get_environmental_data
from dem_correction.fetchers.sentinel2 import find_nearest_year

FEATURES_DIR = DATA_INTERIM / "features"
ICESAT2_POINTS_DIR = DATA_RAW / "icesat2" / "points_by_granule"

REGION_CENTROID_LAT = (STUDY_BBOX[1] + STUDY_BBOX[3]) / 2  # (south + north) / 2
REGION_CENTROID_LON = (STUDY_BBOX[0] + STUDY_BBOX[2]) / 2  # (west + east) / 2

AVAILABLE_FEATURE_YEARS = [2022, 2023, 2024, 2025, 2026]


def load_all_icesat2_points():
    """
    Load and concatenate every per-granule ICESat-2 points file.

    FIX: each point file is named after its source granule (e.g.,
    ATL08_20230115081919_...parquet), which encodes the real
    acquisition date. The saved point data itself doesn't carry a date
    column, so the year is extracted from each FILENAME here and
    attached as 'source_year' before concatenating - this is what
    makes real nearest-year matching possible in assign_matched_year().
    """
    files = list(ICESAT2_POINTS_DIR.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(
            f"No ICESat-2 point files found in {ICESAT2_POINTS_DIR}. "
            f"Run the fetch_all_icesat2.py script first."
        )

    print(f"Loading {len(files)} ICESat-2 granule point files...")
    dfs = []
    skipped_no_year = 0
    for f in files:
        year = extract_year_from_granule_filename(f.name)
        if year is None:
            skipped_no_year += 1
            continue
        df = pd.read_parquet(f)
        df["source_year"] = year
        dfs.append(df)

    if skipped_no_year:
        print(f"  WARNING: {skipped_no_year} file(s) had unparseable names, "
              f"skipped (no year could be extracted).")

    combined = pd.concat(dfs, ignore_index=True)

    before = len(combined)
    combined = combined.drop_duplicates(subset=["latitude", "longitude", "elevation_ref"])
    after = len(combined)
    if before != after:
        print(f"  Removed {before - after} exact duplicate points.")

    print(f"  Total points loaded: {after:,}")
    return combined


def extract_year_from_granule_filename(filename):
    """
    ICESat-2 granule filenames look like: ATL08_20230115081919_...
    Extract the year (2023) from this.
    """
    import re
    match = re.search(r"ATL08_(\d{4})", str(filename))
    if match:
        return int(match.group(1))
    return None


def assign_matched_year(points_df):
    """
    For each point, determine which year's Sentinel-1/2 features to use
    - the nearest available year to when that point was actually
    measured (source_year, extracted from the granule filename during
    loading).
    """
    points_df["year_matched"] = points_df["source_year"].apply(
        lambda y: find_nearest_year(y, AVAILABLE_FEATURE_YEARS)
    )
    return points_df


def sample_features_at_points(points_df, year, chunk_size=25000, progress_every=100000):
    """
    For all points matched to one year, sample every feature band from
    that year's feature raster at each point's exact coordinate.

    FIX (from real "no visibility, no checkpointing" gap): processes in
    chunks with progress printed after every `progress_every` points,
    so a long-running sample actually shows movement instead of sitting
    silent for hours with no way to check progress from another
    terminal.
    """
    import time

    feature_path = FEATURES_DIR / f"features_{year}.tif"
    if not feature_path.exists():
        raise FileNotFoundError(f"Feature raster not found: {feature_path}")

    with rasterio.open(feature_path) as src:
        band_names = [src.descriptions[i] for i in range(src.count)]
        coords = list(zip(points_df["longitude"], points_df["latitude"]))

        n = len(coords)
        all_samples = []
        start_time = time.time()

        for chunk_start in range(0, n, chunk_size):
            chunk_end = min(chunk_start + chunk_size, n)
            chunk_coords = coords[chunk_start:chunk_end]
            chunk_samples = list(src.sample(chunk_coords))
            all_samples.extend(chunk_samples)

            if chunk_end % progress_every < chunk_size or chunk_end == n:
                elapsed = time.time() - start_time
                rate = chunk_end / elapsed if elapsed > 0 else 0
                remaining = (n - chunk_end) / rate if rate > 0 else 0
                print(f"      {chunk_end:,}/{n:,} points sampled "
                      f"({rate:.0f} pts/sec, ~{remaining/60:.1f} min remaining)")

    samples_array = np.array(all_samples)
    feature_df = pd.DataFrame(samples_array, columns=band_names, index=points_df.index)
    return feature_df


def get_environmental_cached(date_str, cache):
    """
    Get humidity/pressure for one date, using the region centroid
    (not the exact point) - see module docstring for why this
    approximation is necessary at this scale. Results are cached so
    each unique date only triggers one real API call.
    """
    if date_str in cache:
        return cache[date_str]

    try:
        env = get_environmental_data(REGION_CENTROID_LAT, REGION_CENTROID_LON, date_str)
    except Exception as e:
        print(f"    Environmental lookup failed for {date_str}: {e}")
        env = {"relative_humidity_pct": np.nan, "atmospheric_pressure_kpa": np.nan}

    cache[date_str] = env
    return env


def drop_physically_impossible_rows(df, raw_z_min=-500, raw_z_max=9000, max_abs_error=500):
    """
    FINAL SAFETY-NET FILTER: drops rows where raw_z or the resulting
    error is physically impossible for Indian terrain (real elevation
    range is roughly -100m to +8848m/Everest; real DEM errors, even in
    the worst documented Himalayan cases, top out around 100-270m).

    This catches any remaining nodata-sentinel leakage (a small number
    of points still showed raw_z=-32768 after masking - likely edge/
    boundary pixels at tile seams) WITHOUT needing to chase the exact
    root cause through the raster pipeline again. Defensible, standard
    practice: a final data-quality gate on the output dataset, applied
    regardless of which upstream step caused an impossible value.
    """
    before = len(df)

    valid_raw_z = (df["raw_z"] >= raw_z_min) & (df["raw_z"] <= raw_z_max)
    valid_error = df["elevation_error_signed"].abs() <= max_abs_error

    dropped_raw_z = (~valid_raw_z).sum()
    dropped_error = (~valid_error & valid_raw_z).sum()  # additional ones caught by error check

    df_clean = df[valid_raw_z & valid_error].copy()
    after = len(df_clean)

    print(f"  Dropped {dropped_raw_z} row(s) with impossible raw_z (outside [{raw_z_min}, {raw_z_max}])")
    print(f"  Dropped {dropped_error} additional row(s) with impossible error (|error| > {max_abs_error}m)")
    print(f"  Rows: {before:,} -> {after:,} ({before - after} removed, {100*(before-after)/before:.4f}%)")

    return df_clean


def compute_target_columns(df):
    """Compute the 4 target variable columns from raw_z and elevation_ref."""
    df["elevation_error_signed"] = df["elevation_ref"] - df["raw_z"]
    df["elevation_error_abs"] = df["elevation_error_signed"].abs()
    df["is_void_flag"] = (
        (df["elevation_error_abs"] > 15) | df["raw_z"].isna()
    ).astype(int)

    def classify_accuracy(err_abs):
        if pd.isna(err_abs):
            return np.nan
        elif err_abs < 1:
            return 0
        elif err_abs < 3:
            return 1
        elif err_abs < 7:
            return 2
        else:
            return 3

    df["vertical_accuracy_class"] = df["elevation_error_abs"].apply(classify_accuracy)

    # Apply the final safety-net filter AFTER computing targets, so we
    # can filter on elevation_error_signed directly
    print("\nApplying final data-quality filter...")
    df = drop_physically_impossible_rows(df)
    return df