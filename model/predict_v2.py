"""
predict_v2.py - drop-in successor of predict.py (same function name, same response keys, extra fields only).
If saved/dem_correction_model_v2.pkl is missing, every call falls back to the original predict.py, so nothing breaks.
Extra feature_values keys (e.g. old form fields no longer used) are ignored.
"""
from pathlib import Path
import json
import numpy as np, pandas as pd, joblib

HERE = Path(__file__).parent
V2_PATH = HERE / "saved" / "dem_correction_model_v2.pkl"
DISAGREEMENT_THRESHOLD_METERS = 5.0   # same safety rule as v1 (reference models vs. primary model)
_art = None

def v2_available() -> bool:
    return V2_PATH.exists()

def _load_artifact():
    """Same name/behaviour the server already imports: returns the artifact dict (v2 if present, else v1)."""
    global _art
    if _art is None:
        if v2_available():
            _art = joblib.load(V2_PATH)
        else:
            from predict import _load_artifact as _old
            _art = _old()
    return _art

def _interval(art, region, tri, pred):
    c = art["conformal"]; edges = c["tri_edges"]; q = {int(k): v for k, v in c["q90"].items()}
    g = int(int(region) * 3 + np.digitize(tri, edges))
    h = q.get(g, max(q.values()))
    return pred - h, pred + h, h

def predict_frame(X: pd.DataFrame) -> np.ndarray:
    """Vectorised primary prediction (used by raster tiling). X must contain the artifact's feature_order columns."""
    art = _load_artifact()
    return art["lgbm_model"].predict(X[art["feature_order"]].astype(np.float32))

def predict_elevation_error(feature_values: dict) -> dict:
    if not v2_available():
        from predict import predict_elevation_error as old
        return old(feature_values)
    art = _load_artifact(); order = art["feature_order"]; med = art["imputation_medians"]
    row = {f: (feature_values[f] if feature_values.get(f) is not None else med[f]) for f in order}
    X = pd.DataFrame([row])[order].astype(np.float32)
    p_main = float(art["lgbm_model"].predict(X)[0])
    p_ridge = float(art["ridge_model"].predict(X.fillna(med))[0])
    p_cat = float(art["catboost_model"].predict(X)[0])
    spread = max(p_main, p_ridge, p_cat) - min(p_main, p_ridge, p_cat)
    reliable = bool(spread <= DISAGREEMENT_THRESHOLD_METERS)
    lo, hi, half = _interval(art, row["terrain_region_class"], row["tri"], p_main)
    res = {
        "predicted_error": round(p_main, 4),
        "model_used": art["model_type"],
        "individual_predictions": {"ridge": round(p_ridge, 4), "lightgbm": round(p_main, 4), "catboost": round(p_cat, 4)},
        "is_reliable": reliable,
        "disagreement_spread_meters": round(spread, 2),
        "validated_rmse": art["validated_rmse"],
        "validated_mae": art["validated_mae"],
        # --- additive fields (old clients ignore them) ---
        "model_version": art["model_version"],
        "interval_lower": round(lo, 4), "interval_upper": round(hi, 4), "interval_half_width_m": round(half, 3),
        "interval_method": "terrain-aware conformal, nominal 90% (observed ~85% on unseen strip)",
        "validated_on": "frozen unseen longitude strip (spatial hold-out)",
    }
    if not reliable:
        res["warning"] = (f"The reference models disagree by {spread:.1f} m with the main model - the inputs may not form a "
                          f"physically realistic combination. Treat this prediction with caution.")
    return res

def explain(feature_values: dict, top_k: int = 8) -> dict:
    """Local explanation: exact TreeSHAP of the primary model (LightGBM pred_contrib). Contributions sum to predicted_error."""
    art = _load_artifact(); order = art["feature_order"]; med = art["imputation_medians"]
    row = {f: (feature_values[f] if feature_values.get(f) is not None else med[f]) for f in order}
    X = pd.DataFrame([row])[order].astype(np.float32)
    c = art["lgbm_model"].predict(X, pred_contrib=True)[0]
    items = sorted(zip(order, c[:-1], X.iloc[0].values), key=lambda t: -abs(t[1]))[:top_k]
    return {"base_value": float(c[-1]), "prediction": float(c.sum()),
            "top_features": [{"feature": f, "value": float(v), "contribution_m": float(s)} for f, s, v in items]}

def global_importance() -> dict:
    return _load_artifact().get("shap_global", {})
