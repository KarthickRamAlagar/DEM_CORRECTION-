"""
Diagnostic: Why Is uncertainty_estimate's Correlation Weaker Than Expected?

Isolates two separate possible causes:
1. Tertile bucketing throwing away signal (continuous score vs the
   final 0/1/2 bucketed column)
2. The 4 components behaving differently against ABSOLUTE error than
   they did against SIGNED error (which is what their weights were
   originally based on)

Run: uv run python etl/diagnose_uncertainty_correlation.py
"""

import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from dem_correction.config import DATA_FINAL

df = pd.read_parquet(DATA_FINAL / "golden_dataset.parquet")

FACTOR_WEIGHTS = {
    "tri": 0.4577,
    "spatial_autocorrelation_moran": 0.2687,
    "terrain_region_class": 0.1028,
    "distance_to_water_km": 0.0744,
}


def normalize(s):
    return (s - s.min()) / (s.max() - s.min())


total_weight = sum(FACTOR_WEIGHTS.values())
score = pd.Series(0.0, index=df.index)
for factor, weight in FACTOR_WEIGHTS.items():
    score += weight * normalize(df[factor])
score = score / total_weight

print("--- Each component's correlation with ABSOLUTE error ---")
print("(compare these to their correlation with SIGNED error, used to set the weights)")
for factor, original_weight in FACTOR_WEIGHTS.items():
    abs_corr = df[factor].corr(df["elevation_error_abs"])
    print(f"  {factor:35s} abs_corr={abs_corr:+.4f}   (weight was based on signed_corr={-original_weight:.4f})")

print()
print("--- Bucketing loss check ---")
continuous_corr = score.corr(df["elevation_error_abs"])
bucketed_corr = df["uncertainty_estimate"].corr(df["elevation_error_abs"])
print(f"  Continuous score (before bucketing): {continuous_corr:.4f}")
print(f"  Bucketed column (actual):            {bucketed_corr:.4f}")
print(f"  Correlation lost purely to bucketing: {continuous_corr - bucketed_corr:.4f}")