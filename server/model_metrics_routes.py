"""
Evaluation Metrics + SHAP.
GET  /api/model/metrics      -> model/saved/eval_summary.json (built by model/evaluation/make_eval_summary.py)
GET  /api/model/shap/global  -> global mean|SHAP| per feature (metres)
GET  /api/model/features     -> feature names + typical (median) values used to fill missing inputs
POST /api/model/explain      -> exact TreeSHAP for one point: {"features": {...}}
"""
import json
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent / "model"))
from predict_v2 import v2_available, _load_artifact, explain as _explain, global_importance as _global

router = APIRouter(prefix="/api/model", tags=["model-metrics"])
SUMMARY = Path(__file__).parent.parent / "model" / "saved" / "eval_summary.json"


def _need_v2():
    if not v2_available():
        raise HTTPException(status_code=503, detail="v2 model artifact not found - run model/training/train_v2.py")


@router.get("/metrics")
def metrics():
    if not SUMMARY.exists():
        raise HTTPException(status_code=404, detail="eval_summary.json missing - run: uv run python model/evaluation/make_eval_summary.py")
    return json.loads(SUMMARY.read_text(encoding="utf-8"))


@router.get("/shap/global")
def shap_global():
    _need_v2()
    return _global()


@router.get("/features")
def features():
    _need_v2()
    art = _load_artifact()
    return {"feature_order": art["feature_order"],
            "typical_values": {k: float(v) for k, v in art["imputation_medians"].items()}}


class ExplainRequest(BaseModel):
    features: dict
    top_k: int = 10


@router.post("/explain")
def explain(req: ExplainRequest):
    _need_v2()
    order = _load_artifact()["feature_order"]
    unknown = [k for k in req.features if k not in order]
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown features: {unknown}")
    return _explain(req.features, top_k=min(max(req.top_k, 1), len(order)))
