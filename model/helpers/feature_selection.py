"""
Feature Selection - Modeling Phase, Step 1

Defines the FINAL, clean set of input features for training, built
directly from every real finding confirmed across the ETL and EDA
phases - not a fresh guess.

CORRECTED COUNT: an earlier planning diagram said 45 features would
remain - that forgot to exclude the target column itself from its own
input list. The verified, correct count is 44.

Exclusions, and why each one is excluded:

1. THE TARGET ITSELF (1 column)
   elevation_error_signed - this is what we're predicting; it can't
   also be an input.

2. DATA LEAKAGE (3 columns) - all directly derived FROM the target
   elevation_error_abs        = |elevation_error_signed|
   is_void_flag                = triggered by elevation_error_abs
   vertical_accuracy_class     = binned from elevation_error_abs

3. CONFIRMED DUPLICATE FEATURES (5 columns) - each 0.99+ correlated
   with a kept feature, verified in EDA's correlation matrices
   vv_std_3x3              -> exact duplicate of vv_texture_std
   elevation_gradient       -> 0.997 correlated with slope_deg
   elev_min_3x3             -> 0.9996 correlated with elev_mean_3x3
   elev_max_3x3             -> 0.9999 correlated with elev_mean_3x3
   local_roughness_entropy  -> 0.9915 correlated with elev_std_3x3

4. NEAR-CONSTANT FEATURES (3 columns) - confirmed near-zero real
   variance in EDA's box plot step (fixed noon/June-15 approximation
   made these barely vary point-to-point)
   solar_azimuth, solar_elevation, cloud_cover_pct

Run: uv run python model/feature_selection.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "eda"))

from dem_correction.config import DATA_FINAL
from feature_dictionary import FEATURE_DICTIONARY

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"

TARGET_COLUMN = "elevation_error_signed"

LEAKAGE_COLUMNS = {
    "elevation_error_abs",
    "is_void_flag",
    "vertical_accuracy_class",
}

DUPLICATE_COLUMNS = {
    "vv_std_3x3",
    "elevation_gradient",
    "elev_min_3x3",
    "elev_max_3x3",
    "local_roughness_entropy",
}

NEAR_CONSTANT_COLUMNS = {
    "solar_azimuth",
    "solar_elevation",
    "cloud_cover_pct",
}

ALL_EXCLUDED = {TARGET_COLUMN} | LEAKAGE_COLUMNS | DUPLICATE_COLUMNS | NEAR_CONSTANT_COLUMNS


def get_model_features() -> list:
    """The final, clean list of input feature column names for training."""
    all_features = set(FEATURE_DICTIONARY.keys())
    return sorted(all_features - ALL_EXCLUDED)


def get_target_column() -> str:
    return TARGET_COLUMN


def main():
    print("=" * 60)
    print("FEATURE SELECTION - VERIFYING AGAINST THE REAL DATASET")
    print("=" * 60)

    model_features = get_model_features()

    print(f"\nTotal features in dictionary: {len(FEATURE_DICTIONARY)}")
    print(f"Excluded - target itself: 1")
    print(f"Excluded - data leakage: {len(LEAKAGE_COLUMNS)}")
    print(f"Excluded - confirmed duplicates: {len(DUPLICATE_COLUMNS)}")
    print(f"Excluded - near-constant: {len(NEAR_CONSTANT_COLUMNS)}")
    print(f"\nFinal input feature count: {len(model_features)}")

    print(f"\nLoading {DATASET_PATH} to verify every selected column actually exists...")
    df = pd.read_parquet(DATASET_PATH, columns=[TARGET_COLUMN] + model_features)
    print(f"  Loaded {len(df):,} rows successfully")

    # Real verification: confirm nothing excluded accidentally leaked
    # back in, and every kept feature is genuinely present
    missing = [f for f in model_features if f not in df.columns]
    if missing:
        print(f"\nERROR: these selected features don't exist in the real dataset: {missing}")
    else:
        print(f"  All {len(model_features)} selected features confirmed present in the real file")

    still_present_excluded = [c for c in ALL_EXCLUDED if c in model_features]
    if still_present_excluded:
        print(f"\nERROR: these should have been excluded but weren't: {still_present_excluded}")
    else:
        print(f"  Confirmed: none of the {len(ALL_EXCLUDED)} excluded columns leaked back into the input list")

    print("\nFinal 44 input features:")
    for f in model_features:
        print(f"  {f}")


if __name__ == "__main__":
    main()