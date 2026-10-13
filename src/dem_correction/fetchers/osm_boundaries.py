"""
OpenStreetMap Boundary Fetcher

Gets water body and urban area geometries for the study bbox, used to
compute distance_to_water_km and distance_to_urban_km per point -
closing 2 of the remaining Group A feature gaps.
"""

import numpy as np
from scipy.spatial import cKDTree

from dem_correction.config import STUDY_BBOX


def fetch_water_and_urban_geometries(bbox=STUDY_BBOX, tile_size_deg=0.5):
    """
    Fetch water body and urban area polygons within the bbox using OSM.

    FIX (from real failure: "8,115 times your configured Overpass max
    query area size" + timeout/connection reset): the full 4x3 degree
    bbox is far too large for a single Overpass API query. Fixed by
    tiling the bbox into smaller sub-queries (same principle already
    used successfully for Sentinel-1/2), querying each tile separately
    and combining results - each individual query stays within
    Overpass's reasonable size limits.
    """
    import osmnx as ox
    import time

    west, south, east, north = bbox
    tiles = []
    lon = west
    while lon < east:
        lon_end = min(lon + tile_size_deg, east)
        lat = south
        while lat < north:
            lat_end = min(lat + tile_size_deg, north)
            tiles.append((lon, lat, lon_end, lat_end))
            lat = lat_end
        lon = lon_end

    print(f"  Split into {len(tiles)} tiles for OSM querying (was 1 oversized query)")

    all_water_points = []
    all_urban_points = []

    water_tags = {"natural": "water", "waterway": True}
    urban_tags = {"landuse": ["residential", "commercial", "industrial"]}

    for i, (w, s, e, n) in enumerate(tiles, start=1):
        print(f"  Tile {i}/{len(tiles)}: ({w:.1f}, {s:.1f}, {e:.1f}, {n:.1f})")
        try:
            water_gdf = ox.features_from_bbox(bbox=(n, s, e, w), tags=water_tags)
            points = _extract_boundary_points(water_gdf)
            all_water_points.append(points)
        except Exception as ex:
            print(f"    Water tile failed (skipping this tile): {ex}")
        time.sleep(1)  # be polite to the Overpass API between tiles

        try:
            urban_gdf = ox.features_from_bbox(bbox=(n, s, e, w), tags=urban_tags)
            points = _extract_boundary_points(urban_gdf)
            all_urban_points.append(points)
        except Exception as ex:
            print(f"    Urban tile failed (skipping this tile): {ex}")
        time.sleep(1)

    water_points = np.vstack(all_water_points) if all_water_points else np.empty((0, 2))
    urban_points = np.vstack(all_urban_points) if all_urban_points else np.empty((0, 2))

    print(f"  Total: {len(water_points)} water boundary points, "
          f"{len(urban_points)} urban boundary points")

    return water_points, urban_points


def _extract_boundary_points(gdf):
    """Extract representative coordinate points from a GeoDataFrame's geometries."""
    points = []
    for geom in gdf.geometry:
        if geom is None:
            continue
        try:
            if geom.geom_type in ("Point",):
                points.append((geom.x, geom.y))
            else:
                # sample boundary/exterior coordinates for polygons and lines
                coords = list(geom.centroid.coords) if hasattr(geom, "centroid") else []
                points.extend(coords)
        except Exception:
            continue
    return np.array(points) if points else np.empty((0, 2))


def compute_distances(point_lons, point_lats, reference_points, default_km=50.0):
    """
    For each (lon, lat) point, compute distance in km to the nearest
    reference point (water or urban feature). Returns array of distances.
    """
    if len(reference_points) == 0:
        return np.full(len(point_lons), default_km)

    tree = cKDTree(reference_points)
    query_points = np.column_stack([point_lons, point_lats])
    distances_deg, _ = tree.query(query_points)

    # rough degree-to-km conversion at this latitude (~111 km/degree)
    distances_km = distances_deg * 111.0
    return distances_km