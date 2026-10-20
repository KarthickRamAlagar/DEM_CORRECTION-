"""
Fix EVI and shadow_index - Reflectance Scaling Bug

Sentinel-2 bands are stored as scaled Digital Numbers (0-10000), not
true reflectance (0-1). NDVI/NDWI/NDSI/BSI are scale-invariant ratios
so they were unaffected - but EVI and shadow_index use formulas with
fixed constants (+1, 6, 7.5) that assume true 0-1 reflectance input,
producing nonsense values (EVI up to 1016, shadow_index up to 7634)
when fed raw unscaled bands.

This recomputes both correctly from the already-saved raw band columns
- no need to re-run the expensive features.py/merge.py pipeline.

Run: uv run python scripts/fix_evi_shadow_index.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL as _DF
DATA_FINAL = _DF.parent / "final_rebuild"

INPUT_PATH = DATA_FINAL / "integrated_dataset_v2.parquet"
OUTPUT_PATH = DATA_FINAL / "golden_dataset.parquet"

SCALE_FACTOR = 10000.0  # Sentinel-2 L2A digital number scaling


def safe_div(a, b):
    return np.divide(a, b, out=np.zeros_like(a, dtype=np.float32), where=(b != 0))


def main():
    print("=" * 60)
    print("FIXING EVI AND SHADOW_INDEX (reflectance scaling bug)")
    print("=" * 60)

    print(f"\nLoading {INPUT_PATH}...")
    df = pd.read_parquet(INPUT_PATH)
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    print("\nBefore fix:")
    print(f"  evi: min={df['evi'].min():.2f}, max={df['evi'].max():.2f}")
    print(f"  shadow_index: min={df['shadow_index'].min():.2f}, max={df['shadow_index'].max():.2f}")

    # Properly scale bands to true reflectance (0-1) before recomputing
    blue = df["band_B02"].values.astype(np.float32) / SCALE_FACTOR
    green = df["band_B03"].values.astype(np.float32) / SCALE_FACTOR
    red = df["band_B04"].values.astype(np.float32) / SCALE_FACTOR
    nir = df["band_B08"].values.astype(np.float32) / SCALE_FACTOR

    evi = 2.5 * safe_div(nir - red, nir + 6 * red - 7.5 * blue + 1)
    shadow_index = np.sqrt(np.clip((1 - blue) * (1 - green), 0, None))

    df["evi"] = evi
    df["shadow_index"] = shadow_index

    print("\nAfter fix:")
    print(f"  evi: min={df['evi'].min():.4f}, max={df['evi'].max():.4f} (should be roughly -1 to +1.5)")
    print(f"  shadow_index: min={df['shadow_index'].min():.4f}, max={df['shadow_index'].max():.4f} (should be 0 to 1)")

    df.to_parquet(OUTPUT_PATH, index=False)

    print(f"\nSaved corrected, final golden dataset: {OUTPUT_PATH}")
    print(f"Rows: {len(df):,}, Columns: {len(df.columns)}")


if __name__ == "__main__":
    main()