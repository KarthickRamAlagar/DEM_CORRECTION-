"""
Raster-Wide DEM Correction (Tiled) - Modeling Phase, Step 7

FIX (from a real crash): loading all 43 bands at full resolution
(14,400 x 10,800) at once needs ~25GB RAM - confirmed by a direct
MemoryError. Rewritten to process the raster in TILES instead.

TILE BOUNDARY CORRECTNESS: the local Moran's I calculation needs each
pixel's real neighbors, including ones in an ADJACENT tile. Fixed by
reading each tile with 1-pixel padding, computing on the padded tile,
then cropping back - verified to give results IDENTICAL to processing
the entire array at once.

Run: uv run python model/apply_raster_correction.py --year 2022
"""

import sys
import argparse
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy import ndimage
import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from dem_correction.config import DATA_FINAL, DATA_INTERIM

MODEL_PATH = Path(__file__).parent / "saved" / "dem_correction_model.pkl"
OUTPUT_DIR = DATA_FINAL / "corrected_rasters"
TILE_SIZE = 1024

RASTER_BAND_ORDER = [
    "raw_z", "slope_deg", "aspect_sin", "aspect_cos", "tri", "tpi",
    "relative_slope_position", "planform_curvature", "profile_curvature",
    "general_curvature", "hillshade", "elevation_gradient", "ndvi", "ndwi",
    "ndsi", "evi", "shadow_index", "bsi", "band_B02", "band_B03", "band_B04",
    "band_B08", "band_B11", "band_B12", "vv", "vh", "vv_vh_ratio", "vv_vh_diff",
    "vv_texture_std", "vh_texture_std", "vv_texture_contrast", "vh_texture_contrast",
    "radar_layover_flag", "radar_shadow_flag", "elev_mean_3x3", "elev_std_3x3",
    "elev_min_3x3", "elev_max_3x3", "slope_mean_5x5", "slope_std_5x5",
    "ndvi_mean_3x3", "vv_std_3x3", "local_roughness_entropy",
]

ATMOSPHERIC_CONSTANTS_BY_YEAR = {
    2022: {"atmospheric_pressure_kpa": 100.38, "relative_humidity_pct": 39.61},
    2023: {"atmospheric_pressure_kpa": 100.38, "relative_humidity_pct": 39.61},
}

UNCERTAINTY_WEIGHTS = {"tri": 0.4577, "spatial_autocorrelation_moran": 0.2687,
                        "terrain_region_class": 0.1028, "distance_to_water_km": 0.0744}

_global_stats = {}


def compute_terrain_region_class(transform, row_offset, col_offset, shape):
    # FIX (confirmed real bug): rasterio.transform.xy() silently
    # FLATTENS 2D row/col array inputs into a 1D list, regardless of
    # the input shape - verified directly, this is not documented
    # behavior most people would expect. Reshape back to the original
    # 2D tile shape afterward.
    rows, cols = np.indices(shape)
    rows = rows + row_offset
    cols = cols + col_offset
    _, lats = rasterio.transform.xy(transform, rows, cols)
    lats = np.array(lats).reshape(shape)
    return (lats >= 27.0).astype(np.float32)


def compute_distance_to_water(ndwi_band, pixel_size_km, threshold=0.0):
    water_mask = ndwi_band > threshold
    if not water_mask.any():
        return np.full_like(ndwi_band, 50.0)
    distance_pixels = ndimage.distance_transform_edt(~water_mask)
    return distance_pixels * pixel_size_km


def compute_local_morans_i(raw_z_padded, global_mean, m2):
    z = raw_z_padded - global_mean
    kernel = np.ones((3, 3))
    kernel[1, 1] = 0
    neighbor_sum = ndimage.convolve(np.nan_to_num(z), kernel, mode="nearest")
    neighbor_count = ndimage.convolve(np.ones_like(z), kernel, mode="nearest")
    return (z / m2) * (neighbor_sum / neighbor_count)


def normalize_with_global_stats(arr, stat_min, stat_max):
    if stat_max == stat_min:
        return np.full_like(arr, 0.5)
    return np.clip((arr - stat_min) / (stat_max - stat_min), 0, 1)


def compute_global_stats(src, band_index):
    print("  Computing global statistics (one pass, needed for Moran's I "
          "and uncertainty normalization)...")
    raw_z_full = src.read(band_index["raw_z"] + 1)
    tri_full = src.read(band_index["tri"] + 1)

    _global_stats["raw_z_mean"] = float(np.nanmean(raw_z_full))
    z = raw_z_full - _global_stats["raw_z_mean"]
    _global_stats["m2"] = float(np.nanmean(z ** 2))
    _global_stats["tri_min"] = float(np.nanmin(tri_full))
    _global_stats["tri_max"] = float(np.nanmax(tri_full))
    _global_stats["moran_min"], _global_stats["moran_max"] = -5.0, 5.0
    _global_stats["dist_water_min"], _global_stats["dist_water_max"] = 0.0, 70.0
    del raw_z_full, tri_full


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2022)
    args = parser.parse_args()

    print("=" * 60)
    print(f"RASTER-WIDE DEM CORRECTION (TILED) - Year {args.year}")
    print("=" * 60)

    raster_path = DATA_INTERIM / "features" / f"features_{args.year}.tif"
    band_index = {name: i for i, name in enumerate(RASTER_BAND_ORDER)}

    print(f"\nLoading model...")
    artifact = joblib.load(MODEL_PATH)
    feature_order = artifact["feature_order"]
    medians = artifact["imputation_medians"]
    w = artifact["meta_weights"]

    with rasterio.open(raster_path) as src:
        height, width = src.height, src.width
        transform = src.transform
        pixel_size_km = abs(transform.a) * 111.0
        profile = src.profile.copy()
        profile.update(count=1, dtype="float32")

        print(f"\nRaster: {width} x {height} pixels, processing in {TILE_SIZE}x{TILE_SIZE} tiles")
        compute_global_stats(src, band_index)

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        raw_out = rasterio.open(OUTPUT_DIR / f"raw_dem_{args.year}.tif", "w", **profile)
        corrected_out = rasterio.open(OUTPUT_DIR / f"corrected_dem_{args.year}.tif", "w", **profile)

        n_tiles_row = (height + TILE_SIZE - 1) // TILE_SIZE
        n_tiles_col = (width + TILE_SIZE - 1) // TILE_SIZE
        tile_num = 0
        total_tiles = n_tiles_row * n_tiles_col

        for row_start in range(0, height, TILE_SIZE):
            for col_start in range(0, width, TILE_SIZE):
                tile_num += 1
                row_end = min(row_start + TILE_SIZE, height)
                col_end = min(col_start + TILE_SIZE, width)
                tile_h, tile_w = row_end - row_start, col_end - col_start

                pad_row_start = max(0, row_start - 1)
                pad_row_end = min(height, row_end + 1)
                pad_col_start = max(0, col_start - 1)
                pad_col_end = min(width, col_end + 1)
                pad_window = Window(pad_col_start, pad_row_start,
                                     pad_col_end - pad_col_start, pad_row_end - pad_row_start)

                padded_stack = src.read(window=pad_window)
                crop_r = row_start - pad_row_start
                crop_c = col_start - pad_col_start

                raw_z_padded = padded_stack[band_index["raw_z"]]
                moran_padded = compute_local_morans_i(
                    raw_z_padded, _global_stats["raw_z_mean"], _global_stats["m2"]
                )
                spatial_moran = moran_padded[crop_r:crop_r + tile_h, crop_c:crop_c + tile_w]

                tile_stack = padded_stack[:, crop_r:crop_r + tile_h, crop_c:crop_c + tile_w]

                terrain_region_class = compute_terrain_region_class(
                    transform, row_start, col_start, (tile_h, tile_w)
                )
                atm = ATMOSPHERIC_CONSTANTS_BY_YEAR.get(args.year, ATMOSPHERIC_CONSTANTS_BY_YEAR[2022])
                atmospheric_pressure = np.full((tile_h, tile_w), atm["atmospheric_pressure_kpa"], dtype=np.float32)
                relative_humidity = np.full((tile_h, tile_w), atm["relative_humidity_pct"], dtype=np.float32)

                ndwi_tile = tile_stack[band_index["ndwi"]]
                distance_to_water = compute_distance_to_water(ndwi_tile, pixel_size_km)

                tri_tile = tile_stack[band_index["tri"]]
                total_weight = sum(UNCERTAINTY_WEIGHTS.values())
                uncertainty_score = (
                    UNCERTAINTY_WEIGHTS["tri"] * normalize_with_global_stats(
                        tri_tile, _global_stats["tri_min"], _global_stats["tri_max"])
                    + UNCERTAINTY_WEIGHTS["spatial_autocorrelation_moran"] * normalize_with_global_stats(
                        spatial_moran, _global_stats["moran_min"], _global_stats["moran_max"])
                    + UNCERTAINTY_WEIGHTS["terrain_region_class"] * terrain_region_class
                    + UNCERTAINTY_WEIGHTS["distance_to_water_km"] * normalize_with_global_stats(
                        distance_to_water, _global_stats["dist_water_min"], _global_stats["dist_water_max"])
                ) / total_weight

                computed_features = {
                    "terrain_region_class": terrain_region_class,
                    "atmospheric_pressure_kpa": atmospheric_pressure,
                    "relative_humidity_pct": relative_humidity,
                    "distance_to_water_km": distance_to_water,
                    "spatial_autocorrelation_moran": spatial_moran,
                    "uncertainty_estimate": uncertainty_score,
                }

                n_pixels = tile_h * tile_w
                feature_matrix = np.zeros((n_pixels, len(feature_order)), dtype=np.float32)
                for i, feature in enumerate(feature_order):
                    if feature in band_index:
                        feature_matrix[:, i] = tile_stack[band_index[feature]].flatten()
                    else:
                        feature_matrix[:, i] = computed_features[feature].flatten()

                X = pd.DataFrame(feature_matrix, columns=feature_order)
                X_imputed = X.fillna(medians)

                pred_ridge = artifact["ridge_model"].predict(X_imputed)
                pred_lgbm = artifact["lgbm_model"].predict(X)
                pred_catboost = artifact["catboost_model"].predict(X)
                predicted_error = (
                    w["ridge"] * pred_ridge + w["lgbm"] * pred_lgbm
                    + w["catboost"] * pred_catboost + w["intercept"]
                ).reshape(tile_h, tile_w)

                raw_z_tile = tile_stack[band_index["raw_z"]]
                corrected_tile = raw_z_tile + predicted_error

                out_window = Window(col_start, row_start, tile_w, tile_h)
                raw_out.write(raw_z_tile.astype(np.float32), 1, window=out_window)
                corrected_out.write(corrected_tile.astype(np.float32), 1, window=out_window)

                if tile_num % 20 == 0 or tile_num == total_tiles:
                    print(f"  Tile {tile_num}/{total_tiles} done "
                          f"({100*tile_num/total_tiles:.1f}%)")

        raw_out.close()
        corrected_out.close()

    print(f"\nSaved:")
    print(f"  Original (raw) DEM:    {OUTPUT_DIR / f'raw_dem_{args.year}.tif'}")
    print(f"  Corrected DEM:         {OUTPUT_DIR / f'corrected_dem_{args.year}.tif'}")
    print(f"\nThese 2 files are now ready for the old-vs-new map comparison.")


if __name__ == "__main__":
    main()