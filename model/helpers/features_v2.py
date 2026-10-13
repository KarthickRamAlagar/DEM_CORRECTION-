"""
Feature definitions v2 (ADDITIVE - feature_selection.py v1 is left untouched).

Same leakage / duplicate / near-constant exclusions as v1, plus a documented
"parity" decision: an input is only kept in the production model if it can be
computed IDENTICALLY at training time and at inference time (technical form,
/api/predict/area, and the raster script). Measured evidence for each drop is
written to outputs/ by the evaluation scripts, never assumed.

  uncertainty_estimate : dropped as a MODEL INPUT. It is a fixed function of
      tri / moran / terrain_region_class / distance_to_water_km (already inputs),
      its weights were fitted to the target on all rows, and it is built three
      different ways (ETL, /area, raster). Kept only as a DISPLAY difficulty index.
  radar (10 cols)      : ~88% missing; no accuracy gain in spatial CV.
"""
TARGET = "elevation_error_signed"          # = elevation_ref - raw_z  ->  corrected = raw_z + prediction

LEAKAGE = {"elevation_error_abs", "is_void_flag", "vertical_accuracy_class"}
DUPLICATES = {"vv_std_3x3", "elevation_gradient", "elev_min_3x3", "elev_max_3x3", "local_roughness_entropy"}
NEAR_CONSTANT = {"solar_azimuth", "solar_elevation", "cloud_cover_pct"}
IDENTIFIERS = {"latitude", "longitude", "elevation_ref", "ground_track", "source_year", "year_matched", "date_str"}

RADAR = ["vv", "vh", "vv_vh_ratio", "vv_vh_diff", "vv_texture_std", "vh_texture_std",
         "vv_texture_contrast", "vh_texture_contrast", "radar_layover_flag", "radar_shadow_flag"]
DATE_PROXY = ["atmospheric_pressure_kpa", "relative_humidity_pct"]   # only 6 distinct values = acquisition-date proxies
PARITY_RISK = ["spatial_autocorrelation_moran", "distance_to_water_km"]  # computed differently at training vs inference

def all_inputs(columns):
    ex = {TARGET} | LEAKAGE | DUPLICATES | NEAR_CONSTANT | IDENTIFIERS | {"uncertainty_estimate"}
    feats = sorted(c for c in columns if c not in ex and not str(c).startswith("_"))   # '_' = internal bookkeeping (fold ids etc.)
    assert not any(str(c).startswith("_") for c in feats), "internal column leaked into features"
    return feats

def feature_sets(columns):
    f43 = all_inputs(columns)
    f33 = [c for c in f43 if c not in RADAR]
    f31 = [c for c in f33 if c not in DATE_PROXY]
    f29 = [c for c in f31 if c not in PARITY_RISK]
    return {"F43_full": f43, "F33_noradar": f33, "F31_nodateproxy": f31, "F29_parity_safe": f29}
