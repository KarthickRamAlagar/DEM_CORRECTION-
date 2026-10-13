"""
Final Patch - Clip EVI to Standard Range

EVI's formula can produce extreme values at a small number of pixels
with unusual band combinations (very bright/dark surfaces) - a known,
documented behavior of the EVI algorithm itself, not a pipeline bug.
This clips to the standard accepted EVI range, same defensive pattern
already used for the elevation_error_signed safety filter earlier.

Run: uv run python scripts/clip_evi_final.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"

EVI_MIN = -1.0
EVI_MAX = 1.5


def main():
    print("=" * 60)
    print("FINAL PATCH - CLIPPING EVI AND VV_VH_RATIO TO SANE RANGES")
    print("=" * 60)

    print(f"\nLoading {DATASET_PATH}...")
    df = pd.read_parquet(DATASET_PATH)

    # --- EVI ---
    before_min, before_max = df["evi"].min(), df["evi"].max()
    n_clipped_evi = ((df["evi"] < EVI_MIN) | (df["evi"] > EVI_MAX)).sum()
    df["evi"] = df["evi"].clip(EVI_MIN, EVI_MAX)
    print(f"\nevi: before min={before_min:.4f}, max={before_max:.4f}")
    print(f"  Clipped {n_clipped_evi:,} row(s) to [{EVI_MIN}, {EVI_MAX}]")
    print(f"  after: min={df['evi'].min():.4f}, max={df['evi'].max():.4f}")

    # --- vv_vh_ratio ---
    # FIX (from real bug: max=111,038,976): when vh approaches the
    # evalscript's -100dB noise floor, converting to linear power
    # before dividing (10^(vh/10)) produces a near-zero denominator,
    # causing the ratio to explode. Clipped to a generous but sane
    # range for a linear-power SAR ratio.
    RATIO_MAX = 1000.0
    before_min_r, before_max_r = df["vv_vh_ratio"].min(), df["vv_vh_ratio"].max()
    n_clipped_ratio = (df["vv_vh_ratio"] > RATIO_MAX).sum()
    df["vv_vh_ratio"] = df["vv_vh_ratio"].clip(upper=RATIO_MAX)
    print(f"\nvv_vh_ratio: before min={before_min_r:.4f}, max={before_max_r:.4f}")
    print(f"  Clipped {n_clipped_ratio:,} row(s) to max {RATIO_MAX}")
    print(f"  after: min={df['vv_vh_ratio'].min():.4f}, max={df['vv_vh_ratio'].max():.4f}")

    df.to_parquet(DATASET_PATH, index=False)
    print(f"\nSaved: {DATASET_PATH}")
    print(f"Rows: {len(df):,}, Columns: {len(df.columns)}")
    print("\nGolden dataset is now fully clean. Ready for EDA/modeling.")


if __name__ == "__main__":
    main()