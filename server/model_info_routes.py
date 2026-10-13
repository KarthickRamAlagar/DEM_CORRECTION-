"""
Model info (read-only): serves the facts recorded in model/saved/registry.json so the UI (Settings > About,
and later the Evaluation Metrics page) never hard-codes accuracy numbers.
GET /api/model/info
"""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/model", tags=["model-info"])

REGISTRY_PATH = Path(__file__).parent.parent / "model" / "saved" / "registry.json"


@router.get("/info")
def get_model_info():
    if not REGISTRY_PATH.exists():
        raise HTTPException(status_code=404, detail="registry.json not found - run model/training/train_v2.py")
    reg = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    frozen = reg["validation"]["frozen_strip"]
    raw = reg["validation"]["frozen_strip_raw_dem"]
    return {
        "model_version": reg["model_version"],
        "algorithm": reg["algorithm"],
        "created_utc": reg["created_utc"],
        "n_features": len(reg["feature_schema"]),
        "training_rows": reg["dataset"]["rows"],
        "frozen_strip_rmse": round(frozen["RMSE"], 4),
        "frozen_strip_mae": round(frozen["MAE"], 4),
        "raw_dem_rmse_same_strip": round(raw["RMSE"], 4),
        "improvement_vs_raw_pct": round(100 * (1 - frozen["RMSE"] / raw["RMSE"]), 1),
        "validation_design": reg["validation"]["design"],
        "known_limits": reg.get("known_limits", []),
    }
