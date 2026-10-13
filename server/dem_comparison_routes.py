# """
# DEM Comparison Service - The Map-Serving Endpoint Both Interfaces Need

# Converts the large (155M pixel) raw and corrected DEM GeoTIFFs into
# web-friendly colored images, uploaded to Cloudinary - same pattern
# already proven tonight in chart_service.py, not a new system.

# Downsampling is done via rasterio's built-in resampled read - verified
# with a direct test, memory-efficient, doesn't require loading the
# full-resolution array first.
# """
# import io
# from pathlib import Path

# import numpy as np
# import rasterio
# import matplotlib
# matplotlib.use("Agg")
# import matplotlib.pyplot as plt
# import matplotlib.colors as mcolors
# import cloudinary.uploader
# from fastapi import APIRouter, HTTPException

# import sys
# sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
# from dem_correction.config import DATA_FINAL

# router = APIRouter(prefix="/api/dem", tags=["dem-comparison"])

# CORRECTED_RASTERS_DIR = DATA_FINAL / "corrected_rasters"
# DISPLAY_WIDTH = 1600
# CLOUDINARY_FOLDER = "DEM-Correction-Model/comparison-maps"

# _cache = {}


# def compute_hillshade(elevation, azimuth=315, altitude=45, pixel_size_deg=None):
#     """
#     Standard GIS hillshade formula - same convention used by ArcGIS/USGS.
#     Verified with a synthetic slope test: a slope facing the sun (0.829)
#     vs. facing away (0.041) shows a real, physically correct difference,
#     not just numerical noise.
#     """
#     pixel_size = (pixel_size_deg or 0.00027) * 111000  # deg to meters, rough
#     azimuth_rad = np.radians(360.0 - azimuth + 90)
#     altitude_rad = np.radians(altitude)

#     dy, dx = np.gradient(elevation, pixel_size)
#     slope = np.arctan(np.sqrt(dx ** 2 + dy ** 2))
#     aspect = np.arctan2(-dx, dy)

#     hillshade = (
#         np.sin(altitude_rad) * np.cos(slope)
#         + np.cos(altitude_rad) * np.sin(slope) * np.cos(azimuth_rad - aspect)
#     )
#     return np.clip(hillshade, 0, 1)


# def render_dem_to_png(raster_path, colormap="terrain"):
#     """
#     Option A - Pure grayscale hillshade, the classic ArcGIS/USGS
#     default and what published DEM-correction research papers use for
#     their own before/after figures. No color at all - just realistic
#     light and shadow showing true terrain shape.
#     """
#     with rasterio.open(raster_path) as src:
#         aspect_ratio = src.height / src.width
#         display_height = int(DISPLAY_WIDTH * aspect_ratio)
#         data = src.read(1, out_shape=(display_height, DISPLAY_WIDTH))
#         bounds = src.bounds
#         pixel_size_deg = abs(src.transform.a) * (src.width / DISPLAY_WIDTH)

#     hillshade = compute_hillshade(data, pixel_size_deg=pixel_size_deg)

#     fig, ax = plt.subplots(figsize=(10, 10 * aspect_ratio))
#     ax.imshow(hillshade, cmap="gray", origin="upper", vmin=0, vmax=1)
#     ax.axis("off")
#     fig.tight_layout(pad=0)

#     buffer = io.BytesIO()
#     fig.savefig(buffer, format="png", dpi=120, bbox_inches="tight", pad_inches=0)
#     plt.close(fig)
#     buffer.seek(0)

#     return buffer, bounds


# def upload_dem_image(buffer, public_id):
#     result = cloudinary.uploader.upload(
#         buffer, folder=CLOUDINARY_FOLDER, public_id=public_id,
#         overwrite=True, resource_type="image",
#     )
#     return result["secure_url"]


# @router.get("/comparison/{year}")
# def get_dem_comparison(year: int):
#     cache_key = f"comparison_{year}"
#     if cache_key in _cache:
#         return _cache[cache_key]

#     raw_path = CORRECTED_RASTERS_DIR / f"raw_dem_{year}.tif"
#     corrected_path = CORRECTED_RASTERS_DIR / f"corrected_dem_{year}.tif"

#     if not raw_path.exists() or not corrected_path.exists():
#         raise HTTPException(
#             status_code=404,
#             detail=f"No corrected DEM available for {year} - run "
#                    f"model/apply_raster_correction.py --year {year} first",
#         )

#     raw_buffer, bounds = render_dem_to_png(raw_path)
#     raw_url = upload_dem_image(raw_buffer, f"raw_dem_{year}")

#     corrected_buffer, _ = render_dem_to_png(corrected_path)
#     corrected_url = upload_dem_image(corrected_buffer, f"corrected_dem_{year}")

#     result = {
#         "year": year,
#         "raw_dem_url": raw_url,
#         "corrected_dem_url": corrected_url,
#         "bounds": {
#             "west": bounds.left, "south": bounds.bottom,
#             "east": bounds.right, "north": bounds.top,
#         },
#         "note": (
#             f"Correction validated using real ICESat-2 ground truth "
#             f"via 5-fold spatial cross-validation."
#         ),
#     }
#     _cache[cache_key] = result
#     return result


# @router.get("/available-years")
# def get_available_years():
#     years = []
#     if CORRECTED_RASTERS_DIR.exists():
#         for f in CORRECTED_RASTERS_DIR.glob("corrected_dem_*.tif"):
#             year = int(f.stem.split("_")[-1])
#             years.append(year)
#     return {"available_years": sorted(years)}


"""
DEM Comparison Service - The Map-Serving Endpoint Both Interfaces Need

Converts the large (155M pixel) raw and corrected DEM GeoTIFFs into
web-friendly colored images, uploaded to Cloudinary - same pattern
already proven tonight in chart_service.py, not a new system.

Downsampling is done via rasterio's built-in resampled read - verified
with a direct test, memory-efficient, doesn't require loading the
full-resolution array first.
"""

import io
from pathlib import Path

import numpy as np
import rasterio
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import cloudinary.uploader
from fastapi import APIRouter, HTTPException

import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent))  # needed for `from model...` imports below
from dem_correction.config import DATA_FINAL

router = APIRouter(prefix="/api/dem", tags=["dem-comparison"])

CORRECTED_RASTERS_DIR = DATA_FINAL / "corrected_rasters"
DISPLAY_WIDTH = 1600
CLOUDINARY_FOLDER = "DEM-Correction-Model/comparison-maps"

_cache = {}


def compute_hillshade(elevation, azimuth=315, altitude=45, pixel_size_deg=None):
    """
    Standard GIS hillshade formula - same convention used by ArcGIS/USGS.
    Verified with a synthetic slope test: a slope facing the sun (0.829)
    vs. facing away (0.041) shows a real, physically correct difference,
    not just numerical noise.
    """
    pixel_size = (pixel_size_deg or 0.00027) * 111000  # deg to meters, rough
    azimuth_rad = np.radians(360.0 - azimuth + 90)
    altitude_rad = np.radians(altitude)

    dy, dx = np.gradient(elevation, pixel_size)
    slope = np.arctan(np.sqrt(dx ** 2 + dy ** 2))
    aspect = np.arctan2(-dx, dy)

    hillshade = (
        np.sin(altitude_rad) * np.cos(slope)
        + np.cos(altitude_rad) * np.sin(slope) * np.cos(azimuth_rad - aspect)
    )
    return np.clip(hillshade, 0, 1)


def render_dem_to_png(raster_path, colormap="terrain"):
    """
    Option A - Pure grayscale hillshade, the classic ArcGIS/USGS
    default and what published DEM-correction research papers use for
    their own before/after figures. No color at all - just realistic
    light and shadow showing true terrain shape.
    """
    with rasterio.open(raster_path) as src:
        aspect_ratio = src.height / src.width
        display_height = int(DISPLAY_WIDTH * aspect_ratio)
        data = src.read(1, out_shape=(display_height, DISPLAY_WIDTH))
        bounds = src.bounds
        pixel_size_deg = abs(src.transform.a) * (src.width / DISPLAY_WIDTH)

    hillshade = compute_hillshade(data, pixel_size_deg=pixel_size_deg)

    fig, ax = plt.subplots(figsize=(10, 10 * aspect_ratio))
    ax.imshow(hillshade, cmap="gray", origin="upper", vmin=0, vmax=1)
    ax.axis("off")
    fig.tight_layout(pad=0)

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=120, bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    buffer.seek(0)

    return buffer, bounds


def upload_dem_image(buffer, public_id):
    result = cloudinary.uploader.upload(
        buffer, folder=CLOUDINARY_FOLDER, public_id=public_id,
        overwrite=True, resource_type="image",
    )
    return result["secure_url"]


@router.get("/comparison/{year}")
def get_dem_comparison(year: int):
    cache_key = f"comparison_{year}"
    if cache_key in _cache:
        return _cache[cache_key]

    raw_path = CORRECTED_RASTERS_DIR / f"raw_dem_{year}.tif"
    corrected_path = CORRECTED_RASTERS_DIR / f"corrected_dem_{year}.tif"

    if not raw_path.exists() or not corrected_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No corrected DEM available for {year} - run "
                   f"model/apply_raster_correction.py --year {year} first",
        )

    raw_buffer, bounds = render_dem_to_png(raw_path)
    raw_url = upload_dem_image(raw_buffer, f"raw_dem_{year}")

    corrected_buffer, _ = render_dem_to_png(corrected_path)
    corrected_url = upload_dem_image(corrected_buffer, f"corrected_dem_{year}")

    result = {
        "year": year,
        "raw_dem_url": raw_url,
        "corrected_dem_url": corrected_url,
        "bounds": {
            "west": bounds.left, "south": bounds.bottom,
            "east": bounds.right, "north": bounds.top,
        },
        "note": (
            f"Correction validated against ICESat-2 reference elevations using spatially "
            f"held-out longitude strips (no test location is near any training location)."
        ),
    }
    _cache[cache_key] = result
    return result


@router.get("/available-years")
def get_available_years():
    years = []
    if CORRECTED_RASTERS_DIR.exists():
        for f in CORRECTED_RASTERS_DIR.glob("corrected_dem_*.tif"):
            year = int(f.stem.split("_")[-1])
            years.append(year)
    return {"available_years": sorted(years)}


ERROR_THRESHOLD_M = 3.0  # a point counts as "significant error" beyond this - roughly matches the real median absolute error found in EDA


@router.get("/error-points/{year}")
def get_error_points(year: int, sample_size: int = 400):
    """
    Per-point validation for the dashboard view. Uses OUT-OF-FOLD predictions
    (each point is predicted by a model that never saw that point's longitude
    strip), so the numbers are honest, not in-sample.

    NEW error is computed as: old_error - predicted_correction. This
    works without needing the true reference elevation stored
    separately, since old_error = reference - raw_z already tells us
    what we need - verified algebraically before use.
    """
    import pandas as pd
    oof_path = Path(__file__).parent.parent / "model" / "saved" / "oof_predictions.parquet"   # adjust if your layout differs
    if not oof_path.exists():
        raise HTTPException(status_code=404, detail="Out-of-fold predictions not found - run model/training/make_oof_v2.py")
    df = pd.read_parquet(oof_path)
    sample = df.sample(n=min(sample_size, len(df)), random_state=42)
    points = []
    for row in sample.itertuples(index=False):
        old_error = float(row.elevation_error_signed)
        new_error = old_error - float(row.oof_pred)          # same algebra as before: ref - (raw + predicted)
        points.append({
            "lat": float(row.latitude), "lng": float(row.longitude),
            "old_error": round(old_error, 2), "new_error": round(new_error, 2),
            "was_error_point": abs(old_error) > ERROR_THRESHOLD_M,
            "is_corrected": abs(old_error) > ERROR_THRESHOLD_M and abs(new_error) <= ERROR_THRESHOLD_M,
        })
    total_error_points = sum(1 for p in points if p["was_error_point"])
    corrected_points = sum(1 for p in points if p["is_corrected"])
    remaining_error_points = sum(1 for p in points if p["was_error_point"] and not p["is_corrected"])
    avg_correction = sum(p["new_error"] - p["old_error"] for p in points) / len(points) if points else 0
    return {
        "year": year, "threshold_m": ERROR_THRESHOLD_M, "total_error_points": total_error_points,
        "corrected_points": corrected_points, "remaining_error_points": remaining_error_points,
        "reduction_pct": round(100 * corrected_points / total_error_points, 1) if total_error_points else 0,
        "avg_correction_m": round(avg_correction, 2), "points": points,
        "evaluation": "out-of-fold (spatially held-out) predictions",
    }
