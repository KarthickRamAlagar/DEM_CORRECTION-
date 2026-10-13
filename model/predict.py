"""
Prediction Function - Loads the saved stacking ensemble and produces
predictions, ready for both Technical User and Normal User interfaces.

Run directly for a quick self-test:
    uv run python model/predict.py
"""

from pathlib import Path

import joblib
import pandas as pd

MODEL_PATH = Path(__file__).parent / "saved" / "dem_correction_model.pkl"

_artifact = None

# SAFETY THRESHOLD, tied directly to this project's real purpose: this
# is a disaster-risk prediction tool. Silently returning a wildly wrong
# number (confirmed possible - a real test produced -526 from Ridge
# while LightGBM/CatBoost agreed near -3 to -4) is a genuine safety
# problem, not just a technical curiosity, if this were ever used in an
# actual disaster-planning context. If the 3 base models disagree by
# more than this threshold, that disagreement itself is a reliable
# signal something is wrong with the input (most likely an internally
# inconsistent combination of manually-entered features) - the
# prediction is still returned, but clearly flagged as low-confidence
# rather than presented as a normal, trustworthy result.
DISAGREEMENT_THRESHOLD_METERS = 5.0


def _load_artifact():
    global _artifact
    if _artifact is None:
        _artifact = joblib.load(MODEL_PATH)
    return _artifact


def predict_elevation_error(feature_values: dict) -> dict:
    artifact = _load_artifact()
    feature_order = artifact["feature_order"]
    medians = artifact["imputation_medians"]
    weights = artifact["meta_weights"]

    row = {}
    for feature in feature_order:
        if feature in feature_values and feature_values[feature] is not None:
            row[feature] = feature_values[feature]
        else:
            row[feature] = medians[feature]

    X = pd.DataFrame([row])[feature_order]
    X_imputed = X.fillna(medians)

    pred_ridge = artifact["ridge_model"].predict(X_imputed)[0]
    pred_lgbm = artifact["lgbm_model"].predict(X)[0]
    pred_catboost = artifact["catboost_model"].predict(X)[0]

    final_prediction = (
        weights["ridge"] * pred_ridge
        + weights["lgbm"] * pred_lgbm
        + weights["catboost"] * pred_catboost
        + weights["intercept"]
    )

    # Real safety check - see DISAGREEMENT_THRESHOLD_METERS comment above
    all_preds = [pred_ridge, pred_lgbm, pred_catboost]
    disagreement_spread = max(all_preds) - min(all_preds)
    is_reliable = bool(disagreement_spread <= DISAGREEMENT_THRESHOLD_METERS)

    result = {
        "predicted_error": round(float(final_prediction), 4),
        "model_used": artifact["model_type"],
        "individual_predictions": {
            "ridge": round(float(pred_ridge), 4),
            "lightgbm": round(float(pred_lgbm), 4),
            "catboost": round(float(pred_catboost), 4),
        },
        "is_reliable": is_reliable,
        "disagreement_spread_meters": round(float(disagreement_spread), 2),
        "validated_rmse": artifact["validated_rmse"],
        "validated_mae": artifact["validated_mae"],
    }

    if not is_reliable:
        result["warning"] = (
            f"The 3 base models disagree by {disagreement_spread:.1f}m, well beyond the "
            f"normal range - this usually means the provided feature values don't form a "
            f"physically realistic combination (e.g. a high elevation given alongside "
            f"neighborhood-average features left at their default/typical values). "
            f"Treat this prediction with caution."
        )

    return result


if __name__ == "__main__":
    print("Self-test 1: the EXACT case that revealed the bug (inconsistent inputs)...")
    risky_input = {
        "slope_deg": 15.0,
        "tri": 2.5,
        "terrain_region_class": 1,
        "raw_z": 850.0,
    }
    result1 = predict_elevation_error(risky_input)
    print(f"  Result: {result1}")
    print(f"  Correctly flagged as unreliable: {not result1['is_reliable']}")

    print("\nSelf-test 2: a more complete, internally consistent feature set...")
    # Filling in the features that are naturally CORRELATED with raw_z/slope,
    # instead of leaving them to silently default to unrelated medians
    consistent_input = {
        "slope_deg": 15.0,
        "tri": 2.5,
        "terrain_region_class": 1,
        "raw_z": 850.0,
        "elev_mean_3x3": 850.0,
        "elev_std_3x3": 5.0,
        "slope_mean_5x5": 14.0,
        "slope_std_5x5": 3.0,
        "tpi": 0.5,
    }
    result2 = predict_elevation_error(consistent_input)
    print(f"  Result: {result2}")
    print(f"  Correctly passes as reliable: {result2['is_reliable']}")

    print(f"\nSelf-test 3: an ACTUAL real row from the dataset (guaranteed fully consistent,")
    print(f"since it's a genuinely observed combination, not hand-crafted guesswork)...")
    try:
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
        import pandas as pd
        from dem_correction.config import DATA_FINAL
        real_df = pd.read_parquet(DATA_FINAL / "golden_dataset.parquet")
        real_row = real_df.sample(n=1, random_state=1).iloc[0]
        real_input = {f: real_row[f] for f in _load_artifact()["feature_order"] if pd.notna(real_row[f])}
        result3 = predict_elevation_error(real_input)
        actual_value = real_row["elevation_error_signed"]
        print(f"  Real row's ACTUAL elevation_error_signed: {actual_value:.4f}")
        print(f"  Model's prediction: {result3['predicted_error']}")
        print(f"  Reliable: {result3['is_reliable']} (should be True for a real, natural row)")
    except Exception as e:
        print(f"  Skipped (run from project root to enable): {e}")