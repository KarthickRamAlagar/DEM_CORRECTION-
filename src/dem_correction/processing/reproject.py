"""
Reproject / Align Module (Stage 7 of the Plan of Action)

WHY THIS STEP MATTERS: even though the DEM mosaic, Sentinel-1 yearly
mosaics, and Sentinel-2 yearly mosaics are all approximately "30m,
WGS84" already, each was built independently (different merge calls,
different origins). "Same resolution, same CRS" does NOT guarantee
"same pixel grid" - two rasters can both be 30m WGS84 and still have
their pixel edges offset from each other by a few meters, which would
silently corrupt every feature lookup in merge.py later (a point could
land in pixel (100,50) in one raster but pixel (100.3, 50.1) in
another).

THE FIX: define ONE canonical reference grid explicitly (from the study
bbox + a fixed resolution + a fixed origin), then reproject/resample
EVERY input raster onto that exact grid. After this step, every raster
has identical width, height, transform, and CRS - guaranteeing
pixel-for-pixel correspondence.
"""

from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds

from dem_correction.config import STUDY_BBOX, DATA_INTERIM

REFERENCE_CRS = "EPSG:4326"
REFERENCE_RESOLUTION_DEG = 0.00027778  # ~30m at this latitude, matches CartoDEM/Sentinel-2 mosaics


def build_reference_grid(bbox=STUDY_BBOX, resolution=REFERENCE_RESOLUTION_DEG):
    """
    Define the ONE canonical grid every raster will be aligned to.
    Returns (transform, width, height) - the exact geometry every
    output raster from this module will share.
    """
    west, south, east, north = bbox
    width = round((east - west) / resolution)
    height = round((north - south) / resolution)
    transform = from_bounds(west, south, east, north, width, height)
    return transform, width, height


def reproject_raster_to_reference(src_path, dst_path, resampling=Resampling.bilinear, nodata=None):
    """
    Reproject/resample ONE raster (any band count) onto the shared
    reference grid. Works for single-band (DEM) or multi-band
    (Sentinel-1's VV+VH) rasters - loops over all bands, applying the
    same target transform/grid to each.

    resampling: use bilinear for continuous data (elevation, VV/VH,
    reflectance), nearest for categorical/flag data (not used here yet,
    but keep in mind for any future categorical feature).
    """
    ref_transform, ref_width, ref_height = build_reference_grid()

    with rasterio.open(src_path) as src:
        band_count = src.count
        src_nodata = nodata if nodata is not None else src.nodata

        out_meta = src.meta.copy()
        out_meta.update({
            "crs": REFERENCE_CRS,
            "transform": ref_transform,
            "width": ref_width,
            "height": ref_height,
            "nodata": src_nodata,
        })

        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(dst_path, "w", **out_meta) as dst:
            for band_idx in range(1, band_count + 1):
                reproject(
                    source=rasterio.band(src, band_idx),
                    destination=rasterio.band(dst, band_idx),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=ref_transform,
                    dst_crs=REFERENCE_CRS,
                    resampling=resampling,
                    src_nodata=src_nodata,
                    dst_nodata=src_nodata,
                )

    return dst_path


def verify_alignment(raster_paths):
    """
    Sanity check: confirm every raster in the list now shares the exact
    same transform, width, and height. Run this after aligning
    everything, before moving on to features.py - if this fails, do NOT
    proceed to feature extraction, since misaligned rasters would
    silently produce wrong feature values at merge time.
    """
    ref_transform, ref_width, ref_height = build_reference_grid()

    print("Verifying alignment against reference grid...")
    print(f"  Reference: {ref_width} x {ref_height}, transform={ref_transform}")

    all_match = True
    for path in raster_paths:
        with rasterio.open(path) as src:
            matches = (
                src.width == ref_width and
                src.height == ref_height and
                src.transform == ref_transform and
                str(src.crs) == REFERENCE_CRS
            )
            status = "OK" if matches else "MISMATCH"
            print(f"  [{status}] {Path(path).name}: {src.width}x{src.height}, crs={src.crs}")
            if not matches:
                all_match = False

    if all_match:
        print("\nAll rasters aligned correctly - safe to proceed to features.py")
    else:
        print("\nWARNING: alignment mismatch found - do NOT proceed until fixed")

    return all_match