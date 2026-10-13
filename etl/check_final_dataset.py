"""
Sanity Check - Final Integrated Dataset

Quick checks before trusting this dataset for modeling:
- Does elevation_error_signed have a sane range?
- Are any columns entirely (or mostly) missing?

Run: uv run python scripts/check_final_dataset.py
"""

import pandas as pd

DATASET_PATH = "data/final/integrated_dataset.parquet"


def main():
    print("=" * 60)
    print("FINAL DATASET SANITY CHECK")
    print("=" * 60)

    df = pd.read_parquet(DATASET_PATH)

    print(f"\nShape: {df.shape[0]:,} rows x {df.shape[1]} columns")

    print("\n--- elevation_error_signed (target column) ---")
    print(df["elevation_error_signed"].describe())

    print("\n--- Missing values per column ---")
    missing = df.isna().sum()
    missing_pct = (missing / len(df) * 100).round(2)
    missing_summary = pd.DataFrame({"missing_count": missing, "missing_pct": missing_pct})
    missing_summary = missing_summary[missing_summary["missing_count"] > 0]

    if len(missing_summary) == 0:
        print("No missing values in any column.")
    else:
        print(missing_summary.sort_values("missing_count", ascending=False).to_string())

    print("\n--- Quick range check on a few key columns ---")
    for col in ["raw_z", "elevation_ref", "slope_deg", "ndvi", "vv", "vh"]:
        if col in df.columns:
            print(f"  {col}: min={df[col].min():.2f}, max={df[col].max():.2f}, mean={df[col].mean():.2f}")

    print("\nDone.")


if __name__ == "__main__":
    main()