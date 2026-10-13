# DEM model v2 - hand-over (all additive; nothing of yours was edited)

## New files (copy into your repo, same relative paths)
model/predict_v2.py
model/saved/dem_correction_model_v2.pkl      (old dem_correction_model.pkl stays as fallback)
model/saved/registry.json
model/helpers/{features_v2,spatial_split_v2}.py
model/evaluation/{data_v2,metrics_v2,run_feature_sets,run_tournament,run_frozen}.py
model/training/train_v2.py
outputs/*  (selection rule, CV table, frozen-strip table, SHAP importance, conformal table)

## Patch 1 - server/predict_routes.py (3 small edits)
a) imports (line 26):   from predict_v2 import predict_elevation_error, _load_artifact
   (falls back to the old model automatically if the v2 pkl is missing)
b) in predict_area(): DELETE the lines that build spatial_autocorrelation_moran, distance_to_water_km,
   uncertainty_estimate and ATMOSPHERIC_CONSTANTS (v2 does not use them). Keep terrain_region_class.
   Risk label now comes from the interval:
       half = result["interval_half_width_m"]
       risk = "Low" if half < 3 else "Medium" if half < 5 else "High"
   and add to the returned dict: "interval_lower": result["interval_lower"], "interval_upper": result["interval_upper"],
   "model_version": result["model_version"].
c) message text: replace "supports flood-risk and landslide-risk mapping here" with
   "Corrected elevation is a model estimate; see the uncertainty range." (the old wording over-claims).

## Patch 2 - model/apply_raster_correction.py
Replace the artifact load + 3-model block (lines ~123-127 and ~216-222) with:
   from predict_v2 import predict_frame, _load_artifact
   feature_order = _load_artifact()["feature_order"]
   ...
   X = pd.DataFrame(feature_matrix, columns=feature_order)
   predicted_error = predict_frame(X).reshape(tile_h, tile_w)
The v2 features are all raster bands plus terrain_region_class, so Moran/water-distance/atmosphere/uncertainty
tile code can stay (unused) or be removed. Then re-run:  uv run python model/apply_raster_correction.py --year 2022   (and 2023)
and refresh the comparison maps. I could not do this here (rasters not available).

## Patch 3 - numbers shown in the UI
Dashboard / metrics now come from registry.json (frozen-strip RMSE 4.06 m, MAE 2.13 m; raw DEM 6.07 m on the same strip).
Do not show 3.313 any more as "the" accuracy; it was a different 5-strip pooled number on a different feature set.
The Dashboard /error-points route should use out-of-fold predictions, not in-sample predictions (not patched: needs your route code + a saved OOF file; ask me for it).

## Patch 4 - session limits
client/src/pages/NewInputsPage.jsx line ~3007: RESET_MS = 7 * 60 * 1000
client/src/pages/AskYourDataPage.jsx line 9:   RESET_MS = 7 * 60 * 1000   (MAX_QUESTIONS left at 5 until you decide)

## Heads-up
The New Inputs form still shows fields for removed inputs (Moran, distance to water, pressure/humidity, uncertainty, radar bands).
v2 ignores them; UI left untouched as agreed.

## Patch 5 - Dashboard /error-points (tested logic)
Replace get_error_points() in server/dem_comparison_routes.py with PATCH_error_points.py (same JSON keys + one extra "evaluation" key).
Copy model/saved/oof_predictions.parquet next to your model (27 MB; made by model/training/make_oof_v2.py).
Pooled out-of-fold RMSE over all 5 strips: 3.28 m vs raw DEM 4.90 m (about 33% better).
