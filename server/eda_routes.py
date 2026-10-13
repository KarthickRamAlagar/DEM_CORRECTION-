"""
EDA API Endpoints - Step 7 of the EDA Page Plan

Serves everything precomputed in Steps 1-6 (plus the two bonus plots)
to the frontend. Every precomputed file is loaded ONCE at server
startup, kept in memory, and just returned as-is per request - no
recalculation ever happens here, matching the whole point of
precomputing in the first place.

Mounted into the main FastAPI app (see main.py) under the "/api/eda"
prefix.
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/eda", tags=["eda"])

PRECOMPUTED_DIR = Path(__file__).parent.parent / "eda" / "precomputed"
FEATURE_DICT_PATH = Path(__file__).parent.parent / "eda" / "feature_dictionary.py"


def _load_json(filename):
    path = PRECOMPUTED_DIR / filename
    if not path.exists():
        print(f"[EDA] WARNING: {filename} not found at startup - "
              f"run the corresponding eda/compute_*.py script first")
        return {}
    with open(path) as f:
        return json.load(f)


# Loaded ONCE, at import time (server startup) - not per-request
print("[EDA] Loading precomputed files into memory...")
_BOXPLOT_STATS = _load_json("boxplot_stats.json")
_HISTOGRAMS = _load_json("histograms.json")
_CORR_BY_GROUP = _load_json("correlations_by_group.json")
_CORR_WITH_TARGET = _load_json("correlation_with_target.json")
_SCATTER_SAMPLES = _load_json("scatter_samples.json")
_SPATIAL_GRID = _load_json("spatial_grid.json")
_SPATIAL_HEXBIN = _load_json("spatial_hexbin.json")
_MORANS_SCATTER = _load_json("morans_scatter.json")
_VARIOGRAM = _load_json("variogram.json")
print(f"[EDA] Loaded. {len(_BOXPLOT_STATS)} features have box plot stats ready.")

# Feature dictionary is real Python code (not JSON) - import it directly
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "eda"))
from feature_dictionary import FEATURE_DICTIONARY, FEATURE_GROUPS, get_features_by_group


# ============================================================
# Groups and Feature Dictionary
# ============================================================

@router.get("/groups")
def get_groups():
    """The 6 feature groups, for the dropdown selector."""
    return FEATURE_GROUPS


@router.get("/features/{group_key}")
def get_features_for_group(group_key: str):
    """
    Everything needed to render one group's page: each feature's
    dictionary info (full name, meaning) PLUS its precomputed box plot
    and histogram stats, combined into one response so the frontend
    doesn't need 3 separate calls per feature.
    """
    if group_key not in FEATURE_GROUPS:
        raise HTTPException(status_code=404, detail=f"Unknown group: {group_key}")

    group_features = get_features_by_group(group_key)
    result = {
        "group": FEATURE_GROUPS[group_key],
        "features": {},
    }

    for feature_name, info in group_features.items():
        result["features"][feature_name] = {
            "full_name": info["full_name"],
            "meaning": info["meaning"],
            "boxplot": _BOXPLOT_STATS.get(feature_name),
            "histogram": _HISTOGRAMS.get(feature_name),
        }

    return result


# ============================================================
# Correlation
# ============================================================

@router.get("/correlation/{group_key}")
def get_group_correlation(group_key: str):
    """Correlation matrix scoped to one group's features."""
    if group_key not in _CORR_BY_GROUP:
        raise HTTPException(status_code=404, detail=f"No correlation data for group: {group_key}")
    return _CORR_BY_GROUP[group_key]


@router.get("/correlation-with-target")
def get_target_correlation():
    """Every feature's correlation with elevation_error_signed, sorted strongest-first."""
    return _CORR_WITH_TARGET


# ============================================================
# Scatter (feature vs. target)
# ============================================================

@router.get("/scatter/{feature_name}")
def get_scatter_sample(feature_name: str):
    """5,000-point sample of one feature plotted against the target."""
    if feature_name not in _SCATTER_SAMPLES.get("features", {}):
        raise HTTPException(status_code=404, detail=f"No scatter sample for feature: {feature_name}")

    return {
        "feature": feature_name,
        "target_column": _SCATTER_SAMPLES["target_column"],
        "x_values": _SCATTER_SAMPLES["features"][feature_name],
        "y_values": _SCATTER_SAMPLES["target_values"],
    }


# ============================================================
# Spatial
# ============================================================

@router.get("/spatial/grid")
def get_spatial_grid():
    """Square-grid density heatmap data."""
    return _SPATIAL_GRID


@router.get("/spatial/hexbin")
def get_spatial_hexbin():
    """Hexagonal-bin density data."""
    return _SPATIAL_HEXBIN


@router.get("/spatial/morans-scatter")
def get_morans_scatter():
    """
    Moran's scatter plot data, WITH LISA-style quadrant classification
    added (High-High, Low-High, High-Low, Low-Low) - a cheap addition
    since we already have the x/y values, no need to recompute the
    expensive neighbor search.
    """
    if not _MORANS_SCATTER:
        raise HTTPException(status_code=404, detail="Moran's scatter data not available")

    x_values = _MORANS_SCATTER["x_own_value"]
    y_values = _MORANS_SCATTER["y_neighbor_average"]

    def classify_quadrant(x, y):
        if x >= 0 and y >= 0:
            return "High-High"   # this point and its neighbors are both above average
        elif x < 0 and y < 0:
            return "Low-Low"     # this point and its neighbors are both below average
        elif x >= 0 and y < 0:
            return "High-Low"    # this point is high, but its neighbors are low (a spatial outlier)
        else:
            return "Low-High"    # this point is low, but its neighbors are high (a spatial outlier)

    quadrants = [classify_quadrant(x, y) for x, y in zip(x_values, y_values)]

    return {
        "value_column": _MORANS_SCATTER["value_column"],
        "x_own_value": x_values,
        "y_neighbor_average": y_values,
        "quadrant": quadrants,
        "note": _MORANS_SCATTER["note"],
    }


@router.get("/variogram")
def get_variogram():
    """Empirical variogram - semivariance vs. distance."""
    return _VARIOGRAM