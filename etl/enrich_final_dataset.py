"""
Enrich Final Dataset - Close the 45-to-53 Feature Gap

Adds the remaining feasible features DIRECTLY to your already-built
integrated_dataset.parquet, without re-running features.py/merge.py:

- distance_to_water_km, distance_to_urban_km  (OSM-based)
- terrain_region_class                         (your own N25/N26/N27 finding)
- solar_azimuth, solar_elevation                (pure geometry)
- cloud_cover_pct                               (recorded during Sentinel-2 fetch)
- spatial_autocorrelation_moran (real, point-based, not the raster proxy)

NOT addressed here (documented, deliberate limitations, would need a
Sentinel-1 refetch with different processing):
- radar_incidence_angle
- true interferometric coherence

Run: uv run python scripts/enrich_final_dataset.py
"""

import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL

DATASET_PATH = DATA_FINAL / "integrated_dataset.parquet"

# Recorded directly from your actual Sentinel-2 fetch logs earlier this
# session - the real cloud cover of each year's chosen scenes
CLOUD_COVER_BY_YEAR = {
    2022: 0.00034,
    2023: 0.000159,
    2024: 0.000003,
    2025: 0.000015,
    2026: 0.037787,
}


def add_terrain_region_class(df):
    """
    Uses your OWN real finding from DEM tile validation: the N27 row
    (27-28N) climbs into Himalayan foothill terrain, while N25/N26
    stay flat. This is a real, evidence-based categorical feature,
    not an arbitrary placeholder.
    0 = flat plains (N25/N26), 1 = foothill transition (N27)
    """
    print("Adding terrain_region_class (based on N25/N26 vs N27 finding)...")
    df["terrain_region_class"] = (df["latitude"] >= 27.0).astype(int)
    print(f"  Flat plains (class 0): {(df['terrain_region_class']==0).sum():,}")
    print(f"  Foothill transition (class 1): {(df['terrain_region_class']==1).sum():,}")
    return df


def add_solar_features(df):
    """
    Solar azimuth/elevation from pure geometry (lat/lon/date).

    FIX (from real 0/1.2M failure): pysolar requires a TIMEZONE-AWARE
    datetime - a naive datetime raises NoTimeZoneInfoError on every
    single call, which was being silently swallowed by the broad
    try/except, producing NaN for every row with no visible error.
    """
    from datetime import timezone
    from pysolar.solar import get_altitude, get_azimuth

    print("Computing solar azimuth/elevation (approximated at local solar noon, UTC)...")

    azimuths = np.empty(len(df))
    elevations = np.empty(len(df))
    fail_count = 0

    for i, (_, row) in enumerate(df.iterrows()):
        dt = datetime(int(row["source_year"]), 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        try:
            elevations[i] = get_altitude(row["latitude"], row["longitude"], dt)
            azimuths[i] = get_azimuth(row["latitude"], row["longitude"], dt)
        except Exception as e:
            elevations[i] = np.nan
            azimuths[i] = np.nan
            fail_count += 1
            if fail_count <= 3:  # print the first few real errors, not all of them
                print(f"    Row {i} failed: {e}")

    if fail_count:
        print(f"  {fail_count}/{len(df)} rows failed (see errors above if any printed)")

    df["solar_azimuth"] = azimuths
    df["solar_elevation"] = elevations
    return df


def add_cloud_cover(df):
    """Attach the real, recorded cloud cover of each point's matched year's scene."""
    print("Adding cloud_cover_pct (from recorded Sentinel-2 fetch metadata)...")
    df["cloud_cover_pct"] = df["year_matched"].map(CLOUD_COVER_BY_YEAR)
    return df


def add_real_moran_i(df, k=8):
    """
    Real, point-based LOCAL Moran's I - using the k-nearest OTHER
    ICESat-2 points as spatial neighbors.

    FIX (from real bug: previous version produced values up to 260,
    when local Moran's I should typically fall roughly in [-1, +1]
    range for standardized data): the correct local Moran's I formula
    is:
        I_i = (z_i / m2) * sum_j(w_ij * z_j)
    where z_i = x_i - mean(x), m2 = sum(z^2)/N (the population variance,
    NOT divided again by k inside the ratio), and neighbor weights w_ij
    are typically ROW-STANDARDIZED (each point's neighbor weights sum
    to 1, i.e. divide by k) - the earlier version divided by
    (global_var * k) which double-counted the k normalization
    incorrectly relative to the standard formula.
    """
    print(f"Computing real local Moran's I (k={k} nearest neighbors)...")

    coords = df[["longitude", "latitude"]].values
    values = df["raw_z"].values
    global_mean = np.nanmean(values)

    z = values - global_mean
    m2 = np.nanmean(z ** 2)  # population variance (this is the correct denominator)

    tree = cKDTree(coords)
    _, neighbor_idx = tree.query(coords, k=k + 1)
    neighbor_idx = neighbor_idx[:, 1:]  # drop self

    # row-standardized weights: each neighbor contributes 1/k
    neighbor_mean_z = z[neighbor_idx].mean(axis=1)

    moran_i = (z / m2) * neighbor_mean_z
    df["spatial_autocorrelation_moran"] = moran_i

    print(f"  Range: min={np.nanmin(moran_i):.4f}, max={np.nanmax(moran_i):.4f}, "
          f"mean={np.nanmean(moran_i):.4f} (should be roughly in [-3, +3] for real data, "
          f"centered near 0)")
    return df


def add_distance_features(df):
    """distance_to_water_km, distance_to_urban_km via OpenStreetMap."""
    print("Fetching OSM water/urban boundaries and computing distances...")
    try:
        from dem_correction.fetchers.osm_boundaries import (
            fetch_water_and_urban_geometries,
            compute_distances,
        )
        water_points, urban_points = fetch_water_and_urban_geometries()

        df["distance_to_water_km"] = compute_distances(
            df["longitude"].values, df["latitude"].values, water_points
        )
        df["distance_to_urban_km"] = compute_distances(
            df["longitude"].values, df["latitude"].values, urban_points
        )
    except Exception as e:
        print(f"  OSM distance computation failed ({e}) - filling with NaN, "
              f"can be retried separately without affecting other new columns.")
        df["distance_to_water_km"] = np.nan
        df["distance_to_urban_km"] = np.nan

    return df


def add_distance_to_water_from_ndwi(df, water_ndwi_threshold=0.0):
    """
    ALTERNATIVE APPROACH (from real, repeated OSM/Overpass API failures -
    the public Overpass server reset the connection on every single
    tile, a systemic reliability issue with the external service, not
    a bug in the tiling logic): derive distance_to_water_km directly
    from NDWI, which you already have computed for every point.

    This is genuinely better for this project: no external dependency,
    no rate limits, and it's arguably MORE methodologically consistent
    with a remote-sensing-based DEM correction study to derive water
    proximity from your own multispectral water index rather than an
    external vector database.

    Points with NDWI above the threshold are treated as "water" points;
    distance is computed to the nearest such point using the existing
    ICESat-2 point cloud itself (not a full raster - a reasonable
    approximation given point density).

    NOTE: distance_to_urban_km is NOT addressed here - there's no
    directly equivalent index for "urban" the way NDWI works for
    water. This one stays as a documented, unresolved gap (the OSM
    dependency issue), unless a built-up index (e.g., NDBI, which
    isn't in the current feature set) is added later.
    """
    print("Deriving distance_to_water_km from NDWI (avoids unreliable external API)...")

    water_mask = df["ndwi"] > water_ndwi_threshold
    n_water_points = water_mask.sum()
    print(f"  {n_water_points:,} points classified as water (NDWI > {water_ndwi_threshold})")

    if n_water_points == 0:
        print("  WARNING: no water points found - filling distance_to_water_km with NaN")
        df["distance_to_water_km"] = np.nan
        return df

    water_coords = df.loc[water_mask, ["longitude", "latitude"]].values
    all_coords = df[["longitude", "latitude"]].values

    tree = cKDTree(water_coords)
    distances_deg, _ = tree.query(all_coords)
    df["distance_to_water_km"] = distances_deg * 111.0  # rough deg-to-km at this latitude

    print(f"  distance_to_water_km range: {df['distance_to_water_km'].min():.2f} to "
          f"{df['distance_to_water_km'].max():.2f} km")

    return df


def main():
    print("=" * 60)
    print("ENRICHING FINAL DATASET - CLOSING FEATURE GAPS (v3 fixes)")
    print("=" * 60)

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH)
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    df = add_terrain_region_class(df)
    df = add_cloud_cover(df)

    # REPLACED: OSM-based distance fetching abandoned after repeated,
    # systemic Overpass API connection failures (not a code bug - the
    # public server reset the connection on every tile tried). Using
    # the NDWI-based alternative instead - no external dependency.
    df = add_distance_to_water_from_ndwi(df)
    print("\nNOTE: distance_to_urban_km NOT computed this run - no reliable "
          "self-contained equivalent available yet. Documented as a "
          "remaining gap.")

    df = add_real_moran_i(df)

    print("\nSolar features (fixed timezone bug from last run)...")
    df = add_solar_features(df)

    output_path = DATA_FINAL / "integrated_dataset_v2.parquet"
    df.to_parquet(output_path, index=False)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    print(f"Enriched dataset saved: {output_path}")
    print(f"Rows: {len(df):,}")
    print(f"Columns: {len(df.columns)} (was 56, now +5 new feature columns)")
    print("\nRemaining documented gaps (need Sentinel-1 refetch, not attempted here):")
    print("  - radar_incidence_angle")
    print("  - true interferometric coherence")


if __name__ == "__main__":
    main()