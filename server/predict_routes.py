"""
Prediction Endpoints - One Model, Two Ways of Giving Inputs

/api/predict/technical - Technical User provides feature values
directly. Any field not provided is pre-filled with the model's own
saved median (NOT left blank) - prevents the real disagreement bug
found earlier tonight (partial/inconsistent input caused Ridge to
produce a wildly wrong -526m prediction).

/api/predict/area - Normal User just clicks a point on the map. Real
feature values are looked up directly from the actual raster at that
exact pixel - guaranteed internally consistent.
"""

import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy import ndimage
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent / "model"))
from predict_v2 import predict_elevation_error, _load_artifact, v2_available   # v2 falls back to the old model if its file is missing

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from dem_correction.config import DATA_INTERIM

router = APIRouter(prefix="/api/predict", tags=["prediction"])

RASTER_BAND_ORDER = [
    "raw_z", "slope_deg", "aspect_sin", "aspect_cos", "tri", "tpi",
    "relative_slope_position", "planform_curvature", "profile_curvature",
    "general_curvature", "hillshade", "elevation_gradient", "ndvi", "ndwi",
    "ndsi", "evi", "shadow_index", "bsi", "band_B02", "band_B03", "band_B04",
    "band_B08", "band_B11", "band_B12", "vv", "vh", "vv_vh_ratio", "vv_vh_diff",
    "vv_texture_std", "vh_texture_std", "vv_texture_contrast", "vh_texture_contrast",
    "radar_layover_flag", "radar_shadow_flag", "elev_mean_3x3", "elev_std_3x3",
    "elev_min_3x3", "elev_max_3x3", "slope_mean_5x5", "slope_std_5x5",
    "ndvi_mean_3x3", "vv_std_3x3", "local_roughness_entropy",
]

ATMOSPHERIC_CONSTANTS = {"atmospheric_pressure_kpa": 100.38, "relative_humidity_pct": 39.61}
DEFAULT_YEAR = 2022


def risk_label(uncertainty_score: float) -> str:
    if uncertainty_score < 0.33:
        return "Low"
    elif uncertainty_score < 0.66:
        return "Medium"
    return "High"


class TechnicalPredictRequest(BaseModel):
    feature_values: dict


class AreaPredictRequest(BaseModel):
    latitude: float
    longitude: float
    year: int = DEFAULT_YEAR


# --- year fix: available feature years ---
@router.get("/available-years")
def get_available_feature_years():
    """Years that have a features_<year>.tif on disk (the map-click prediction needs one)."""
    folder = DATA_INTERIM / "features"
    years = []
    if folder.exists():
        for f in folder.glob("features_*.tif"):
            tail = f.stem.split("_")[-1]
            if tail.isdigit():
                years.append(int(tail))
    return {"available_years": sorted(years), "default_year": DEFAULT_YEAR}


@router.get("/technical/defaults")
def get_technical_defaults():
    artifact = _load_artifact()
    medians = artifact["imputation_medians"]
    return {"defaults": {k: float(v) for k, v in medians.items()}, "feature_order": artifact["feature_order"]}


@router.post("/technical")
def predict_technical(request: TechnicalPredictRequest):
    return predict_elevation_error(request.feature_values)


@router.post("/area")
def predict_area(request: AreaPredictRequest):
    raster_path = DATA_INTERIM / "features" / f"features_{request.year}.tif"
    if not raster_path.exists():
        raise HTTPException(status_code=404, detail=f"No feature data available for {request.year}")

    band_index = {name: i for i, name in enumerate(RASTER_BAND_ORDER)}

    with rasterio.open(raster_path) as src:
        row, col = src.index(request.longitude, request.latitude)
        if not (0 <= row < src.height and 0 <= col < src.width):
            raise HTTPException(status_code=400, detail="Coordinates fall outside the study area")

        window = Window(max(0, col - 1), max(0, row - 1), 3, 3)
        small_stack = src.read(window=window)
        center_r, center_c = min(1, row), min(1, col)

        point_values = {}
        for feature, idx in band_index.items():
            point_values[feature] = float(small_stack[idx, center_r, center_c])

        point_values["terrain_region_class"] = 1.0 if request.latitude >= 27.0 else 0.0

        if not v2_available():
            # LEGACY PATH (old model only): these derived inputs are not used by the v2 model.
            raw_z_patch = small_stack[band_index["raw_z"]]
            global_mean = float(np.nanmean(raw_z_patch))
            z = raw_z_patch - global_mean
            m2 = float(np.nanmean(z ** 2)) or 1e-6
            kernel = np.ones((3, 3))
            kernel[1, 1] = 0
            neighbor_mean_z = ndimage.convolve(z, kernel, mode="nearest")[center_r, center_c] / 8
            point_values["spatial_autocorrelation_moran"] = float((z[center_r, center_c] / m2) * neighbor_mean_z)
            point_values.update(ATMOSPHERIC_CONSTANTS)
            ndwi_val = point_values["ndwi"]
            point_values["distance_to_water_km"] = 0.0 if ndwi_val > 0 else 5.0
            uncertainty_weights = {"tri": 0.4577, "spatial_autocorrelation_moran": 0.2687,
                                    "terrain_region_class": 0.1028, "distance_to_water_km": 0.0744}
            total_weight = sum(uncertainty_weights.values())
            point_values["uncertainty_estimate"] = sum(
                uncertainty_weights[f] * min(1.0, max(0.0, point_values[f] / 10)) for f in uncertainty_weights
            ) / total_weight

    result = predict_elevation_error(point_values)

    if "interval_half_width_m" in result:       # v2 model: risk comes from the terrain-aware interval width
        half = result["interval_half_width_m"]
        risk = "Low" if half < 3 else "Medium" if half < 5 else "High"
    else:                                         # legacy model
        risk = risk_label(point_values["uncertainty_estimate"])

    response = {
        "latitude": request.latitude,
        "longitude": request.longitude,
        "raw_elevation": point_values["raw_z"],
        "predicted_correction": result["predicted_error"],
        "corrected_elevation": point_values["raw_z"] + result["predicted_error"],
        "risk_level": risk,
        "is_reliable": result["is_reliable"],
        "message": (
            f"This area shows {risk.lower()} elevation uncertainty. "
            f"Corrected elevation is a model estimate - see the uncertainty range before using it for planning."
        ),
    }
    for k in ("interval_lower", "interval_upper", "model_version"):   # additive fields (v2 only)
        if k in result:
            response[k] = result[k]
    if "interval_lower" in result:
        response["corrected_interval"] = [point_values["raw_z"] + result["interval_lower"],
                                          point_values["raw_z"] + result["interval_upper"]]
    return response
