"""
Feature Engineering Module (Stage 8 of the Plan of Action)

Computes feature columns from the aligned rasters (DEM, Sentinel-1,
Sentinel-2). Organized to match Section 9 of your spec (groups A-F).

HONEST SCOPE NOTE: not all 55 originally-listed features are computed
here. Some genuinely need data this pipeline doesn't have:
- Group A (distance to water/urban): needs a vector boundary layer
  (e.g., OpenStreetMap) - NOT built yet, would need a new fetcher.
- Group D (radar incidence angle, layover/shadow flags): the simple
  VV/VH pull via Process API doesn't expose these directly - would
  need different SAR processing.
- Group E (cloud_cover_pct per pixel, humidity, pressure): these are
  POINT-and-DATE-specific (via NASA POWER), not spatial rasters -
  computed later in merge.py, once we know each ICESat-2 point's
  matched year/date, not here.
- GLCM texture (true co-occurrence matrix): computationally expensive
  and needs extra dependencies - approximated here with local standard
  deviation as a simpler texture proxy, clearly labeled as such.
- Full Moran's I: needs libpysal: approximated here with a simpler
  local spatial variance measure.

Everything else - all topographic derivatives, all optical indices,
core SAR features, and neighborhood statistics - is computed for real.
"""

import numpy as np
import rasterio
from scipy import ndimage

from dem_correction.config import DATA_INTERIM

PIXEL_SIZE_M = 30.0  # matches the reference grid resolution


def fast_local_std(arr, size):
    """
    Vectorized windowed standard deviation - std = sqrt(E[x^2] - E[x]^2),
    computed with fast uniform_filter (C-level, vectorized) instead of
    generic_filter(np.std) (Python-level, one function call PER PIXEL).

    THIS IS A CRITICAL FIX: the original version of this module used
    generic_filter for every texture/std calculation. Across a
    155-million-pixel raster, calling a Python function once per pixel
    for 6 separate std calculations x 5 years would have realistically
    taken DAYS, not hours. This vectorized version does the same
    calculation in seconds.
    """
    mean = ndimage.uniform_filter(arr, size=size)
    mean_sq = ndimage.uniform_filter(arr.astype(np.float64) ** 2, size=size)
    variance = mean_sq - mean.astype(np.float64) ** 2
    variance = np.clip(variance, 0, None)  # guard against tiny negative float error
    return np.sqrt(variance).astype(np.float32)


# ============================================================
# GROUP B: Topographic Derivatives (from DEM)
# ============================================================

DEM_NODATA_SENTINEL = -32768.0  # confirmed from CartoDEM's own GDAL_NODATA tag


def mask_nodata(array, sentinel=DEM_NODATA_SENTINEL):
    """
    FIX (from real bug found via sanity check): nodata sentinel values
    (-32768, CartoDEM's own nodata marker) were flowing through the
    entire pipeline as if they were real elevation/reflectance values -
    corrupting not just the pixel itself but its NEIGHBORS too, since
    gradient/curvature calculations treat a -32768 cliff as a real,
    enormous slope. This converts sentinel values to NaN immediately
    after reading, before any computation touches them.
    """
    return np.where(array <= sentinel + 1, np.nan, array)


def compute_topographic_features(dem, pixel_size=PIXEL_SIZE_M):
    """
    Compute all topographic derivatives from a single-band elevation array.
    Returns a dict of 2D arrays, all the same shape as `dem`.
    """
    dem = mask_nodata(dem)
    dz_dy, dz_dx = np.gradient(dem, pixel_size)

    # Slope (radians -> degrees)
    slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    slope_deg = np.degrees(slope_rad)

    # Aspect (direction of steepest descent), then cyclic-encoded
    aspect_rad = np.arctan2(-dz_dx, dz_dy)
    aspect_deg = (np.degrees(aspect_rad) + 360) % 360
    aspect_sin = np.sin(np.radians(aspect_deg))
    aspect_cos = np.cos(np.radians(aspect_deg))

    # Local elevation gradient magnitude
    gradient_magnitude = np.sqrt(dz_dx**2 + dz_dy**2)

    # Terrain Ruggedness Index: sqrt(sum((Z_ij - Z_0)^2)) over a 3x3 window
    z0 = dem
    z_mean_3x3 = ndimage.uniform_filter(dem, size=3)
    tri = np.sqrt(ndimage.uniform_filter((dem - z_mean_3x3) ** 2, size=3))

    # Topographic Position Index: Z0 - mean(local neighborhood), 5x5 window
    z_mean_5x5 = ndimage.uniform_filter(dem, size=5)
    tpi = z0 - z_mean_5x5

    # Curvatures (second derivatives)
    d2z_dx2 = np.gradient(dz_dx, pixel_size, axis=1)
    d2z_dy2 = np.gradient(dz_dy, pixel_size, axis=0)
    d2z_dxdy = np.gradient(dz_dx, pixel_size, axis=0)

    # Profile curvature (curvature along the slope direction)
    denom = (dz_dx**2 + dz_dy**2)
    denom_safe = np.where(denom == 0, 1e-10, denom)
    profile_curvature = (
        (d2z_dx2 * dz_dx**2 + 2 * d2z_dxdy * dz_dx * dz_dy + d2z_dy2 * dz_dy**2)
        / denom_safe
    )

    # Planform curvature (curvature across the slope direction)
    planform_curvature = (
        (d2z_dx2 * dz_dy**2 - 2 * d2z_dxdy * dz_dx * dz_dy + d2z_dy2 * dz_dx**2)
        / denom_safe
    )

    # General curvature (simple sum, a common basic definition)
    general_curvature = d2z_dx2 + d2z_dy2

    # Hillshade (standard illumination model, sun at 315 deg azimuth, 45 deg elevation)
    azimuth_rad = np.radians(315.0)
    altitude_rad = np.radians(45.0)
    hillshade = (
        np.sin(altitude_rad) * np.cos(slope_rad) +
        np.cos(altitude_rad) * np.sin(slope_rad) * np.cos(azimuth_rad - aspect_rad)
    )
    hillshade = np.clip(hillshade, 0, 1)

    # Relative slope position: this pixel's elevation rank within a local window
    z_min_5x5 = ndimage.minimum_filter(dem, size=5)
    z_max_5x5 = ndimage.maximum_filter(dem, size=5)
    range_safe = np.where((z_max_5x5 - z_min_5x5) == 0, 1e-10, z_max_5x5 - z_min_5x5)
    relative_slope_position = (dem - z_min_5x5) / range_safe

    return {
        "slope_deg": slope_deg,
        "aspect_sin": aspect_sin,
        "aspect_cos": aspect_cos,
        "tri": tri,
        "tpi": tpi,
        "relative_slope_position": relative_slope_position,
        "planform_curvature": planform_curvature,
        "profile_curvature": profile_curvature,
        "general_curvature": general_curvature,
        "hillshade": hillshade,
        "elevation_gradient": gradient_magnitude,
    }


# ============================================================
# GROUP C: Optical / Spectral Indices (from Sentinel-2 bands)
# ============================================================

def compute_optical_features(bands):
    """
    bands: dict with keys 'B02','B03','B04','B08','B11','B12' (float32 arrays)
    Returns a dict of computed spectral indices.

    FIX: masks nodata sentinel values in each band before any index
    computation - previously a single nodata pixel in one band could
    produce a nonsense NDVI/NDWI/etc value at that pixel.
    """
    blue = mask_nodata(bands["B02"])
    green = mask_nodata(bands["B03"])
    red = mask_nodata(bands["B04"])
    nir = mask_nodata(bands["B08"])
    swir1 = mask_nodata(bands["B11"])
    swir2 = mask_nodata(bands["B12"])

    def safe_div(a, b):
        return np.divide(a, b, out=np.zeros_like(a, dtype=np.float32), where=(b != 0))

    ndvi = safe_div(nir - red, nir + red)
    ndwi = safe_div(green - nir, green + nir)
    ndsi = safe_div(green - swir1, green + swir1)
    evi = 2.5 * safe_div(nir - red, nir + 6 * red - 7.5 * blue + 1)
    shadow_index = np.sqrt(np.clip((1 - blue) * (1 - green), 0, None))
    bsi = safe_div((swir1 + red) - (nir + blue), (swir1 + red) + (nir + blue))

    return {
        "ndvi": ndvi,
        "ndwi": ndwi,
        "ndsi": ndsi,
        "evi": evi,
        "shadow_index": shadow_index,
        "bsi": bsi,
    }


# ============================================================
# GROUP D: SAR Features (from Sentinel-1 VV/VH)
# ============================================================

def compute_sar_features(vv, vh):
    """
    vv, vh: 2D arrays, backscatter in dB (as returned by the Process API
    evalscript used during fetching).

    FIX: vv_vh_ratio and vv_vh_diff were previously identical (both just
    vv - vh in dB space). Fixed here - ratio is now computed properly in
    LINEAR power space (the mathematically correct way to express a
    ratio), while diff stays as the dB difference - these are now two
    genuinely distinct features, not duplicates.

    ADDED: layover/shadow flags (threshold-based proxies - real radar
    layover/shadow detection needs incidence angle data this pipeline
    doesn't have; these flags approximate it from unusually extreme
    backscatter values, which is a real but imperfect proxy) and a
    second texture measure (local range, distinct from the std-based
    one) to get closer to the original 10-feature SAR group target.

    FIX: masks nodata sentinel BEFORE any use, including storing the
    raw vv/vh values themselves - same class of bug found in raw_z and
    the raw optical bands (the sentinel value must never be stored or
    computed with, or it silently corrupts everything downstream).
    """
    vv = mask_nodata(vv, sentinel=DEM_NODATA_SENTINEL)
    vh = mask_nodata(vh, sentinel=DEM_NODATA_SENTINEL)

    # Ratio in LINEAR power space (correct), not just dB subtraction
    vv_linear = 10 ** (vv / 10)
    vh_linear = 10 ** (vh / 10)
    vh_linear_safe = np.where(vh_linear == 0, 1e-10, vh_linear)
    vv_vh_ratio = vv_linear / vh_linear_safe

    # Difference stays in dB space (a genuinely different quantity now)
    vv_vh_diff = vv - vh

    # Texture: two distinct measures - local std (already had) and
    # local range (max-min), a second simple texture proxy
    vv_texture_std = fast_local_std(vv, size=3)
    vh_texture_std = fast_local_std(vh, size=3)
    vv_texture_contrast = ndimage.maximum_filter(vv, size=3) - ndimage.minimum_filter(vv, size=3)
    vh_texture_contrast = ndimage.maximum_filter(vh, size=3) - ndimage.minimum_filter(vh, size=3)

    # Layover/shadow proxy flags - approximation, not true incidence-angle-based detection
    radar_layover_flag = (vv > np.nanpercentile(vv, 98)).astype(np.float32)
    radar_shadow_flag = (vv < np.nanpercentile(vv, 2)).astype(np.float32)

    return {
        "vv": vv,
        "vh": vh,
        "vv_vh_ratio": vv_vh_ratio,
        "vv_vh_diff": vv_vh_diff,
        "vv_texture_std": vv_texture_std,
        "vh_texture_std": vh_texture_std,
        "vv_texture_contrast": vv_texture_contrast,
        "vh_texture_contrast": vh_texture_contrast,
        "radar_layover_flag": radar_layover_flag,
        "radar_shadow_flag": radar_shadow_flag,
    }


# ============================================================
# GROUP F: Spatial Neighborhood Statistics
# ============================================================

def compute_neighborhood_features(dem, slope, ndvi, vv):
    """
    3x3 and 5x5 windowed statistics on elevation, slope, NDVI, VV -
    computed AFTER the base features above already exist.
    """
    return {
        "elev_mean_3x3": ndimage.uniform_filter(dem, size=3),
        "elev_std_3x3": fast_local_std(dem, size=3),
        "elev_min_3x3": ndimage.minimum_filter(dem, size=3),
        "elev_max_3x3": ndimage.maximum_filter(dem, size=3),
        "slope_mean_5x5": ndimage.uniform_filter(slope, size=5),
        "slope_std_5x5": fast_local_std(slope, size=5),
        "ndvi_mean_3x3": ndimage.uniform_filter(ndvi, size=3),
        "vv_std_3x3": fast_local_std(vv, size=3),
        # simplified local spatial variance as a Moran's I proxy -
        # true Moran's I needs a spatial weights library (libpysal),
        # not included here
        "local_roughness_entropy": fast_local_std(dem, size=5),
    }


# ============================================================
# Orchestration: compute everything for one year, save as a
# multi-band GeoTIFF with named bands
# ============================================================

def compute_all_features_for_year(dem_path, s1_path, s2_band_paths, output_path,
                                    strip_height=1500, overlap=15):
    """
    FIX (from real memory crash): the original version loaded the ENTIRE
    14400x10800 raster for every input and held dozens of same-sized
    intermediate arrays in memory simultaneously - crashed trying to
    allocate a single 593 MiB array because too many others were already
    alive at once.

    This version processes the raster in horizontal STRIPS instead of
    all at once: reads a strip (with a small overlap buffer so
    gradient/neighborhood filters don't produce edge artifacts),
    computes all features for just that strip, writes it directly to
    the output file, then discards it before moving to the next strip.
    Peak memory usage is now bounded by ONE strip's worth of arrays,
    not the whole raster.

    strip_height: rows processed per chunk. Lower = less memory used,
    but more overhead from repeated reads. 1500 rows is a reasonable
    starting point - reduce further (e.g., 500) if this still runs out
    of memory on your machine.
    overlap: extra rows read on each side of a strip, trimmed off
    before writing - needed so window-based calculations (slope,
    curvature, neighborhood stats) don't produce wrong values right at
    strip boundaries.
    """
    from pathlib import Path

    with rasterio.open(dem_path) as src:
        full_height = src.height
        full_width = src.width
        ref_meta = src.meta.copy()

    # Build the final list of feature names once (from a tiny test strip)
    # so we know how many bands to allocate in the output file up front.
    sample_names = _get_feature_names()

    out_meta = ref_meta.copy()
    # FIX (from real recurring disk-space crashes): enable lossless
    # compression on the output GeoTIFF. Uncompressed, each year's
    # 43-band feature stack needs ~26.75 GB - with compression this
    # typically shrinks 30-60% for continuous float data, which should
    # durably avoid the repeated "a few GB short" crashes happening
    # across 2023/2024/2025/2026, instead of manually freeing space
    # for each year one at a time.
    out_meta.update({
        "count": len(sample_names),
        "dtype": "float32",
        "BIGTIFF": "YES",  # THE ONE CONFIRMED-NECESSARY FIX: classic
                           # GeoTIFF has a hard 4GB file size limit -
                           # this was the true cause of every earlier
                           # write crash. Everything else (compression,
                           # tiling) has been REMOVED here - too many
                           # things were changed at once, one of them
                           # (or their combination) is now causing a
                           # hang instead of a crash. Simplifying back
                           # to the one confirmed-necessary fix, at the
                           # cost of a larger uncompressed file, to
                           # isolate what actually works.
    })

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # FIX (from real interrupted-run bug): rasterio creates the file on
    # disk the MOMENT it's opened for writing, before any actual strip
    # data is written. If the process is interrupted partway through
    # (as happened - 3 of 8 strips done), the file already EXISTS on
    # disk but is incomplete/corrupted - and the orchestration script's
    # "if output_path.exists(): skip" check can't tell the difference,
    # silently treating a 37%-complete file as fully done.
    #
    # Fix: write to a temporary filename during processing, and only
    # rename to the real output_path after EVERY strip has been
    # successfully written. This guarantees "the final filename exists"
    # can only mean "genuinely complete" - the same safe pattern already
    # used for Sentinel-2 downloads (.partial -> rename on success).
    tmp_output_path = Path(str(output_path) + ".partial")

    with rasterio.open(tmp_output_path, "w", **out_meta) as dst:
        for band_idx, name in enumerate(sample_names, start=1):
            dst.set_band_description(band_idx, name)

        row = 0
        strip_num = 0
        total_strips = (full_height + strip_height - 1) // strip_height
        while row < full_height:
            strip_num += 1
            row_end = min(row + strip_height, full_height)

            read_start = max(0, row - overlap)
            read_end = min(full_height, row_end + overlap)
            read_window = rasterio.windows.Window(
                0, read_start, full_width, read_end - read_start
            )

            print(f"    Strip {strip_num}/{total_strips} (rows {row}-{row_end})...")

            with rasterio.open(dem_path) as src:
                dem_strip = src.read(1, window=read_window).astype(np.float32)
            with rasterio.open(s1_path) as src:
                vv_strip = src.read(1, window=read_window).astype(np.float32)
                vh_strip = src.read(2, window=read_window).astype(np.float32)
            s2_strip = {}
            for band_name, path in s2_band_paths.items():
                with rasterio.open(path) as src:
                    s2_strip[band_name] = src.read(1, window=read_window).astype(np.float32)

            features_strip = {"raw_z": mask_nodata(dem_strip)}
            topo = compute_topographic_features(dem_strip)
            features_strip.update(topo)

            optical = compute_optical_features(s2_strip)
            features_strip.update(optical)
            for band_name, arr in s2_strip.items():
                features_strip[f"band_{band_name}"] = mask_nodata(arr)

            sar = compute_sar_features(vv_strip, vh_strip)
            features_strip.update(sar)

            neighborhood = compute_neighborhood_features(
                dem_strip, topo["slope_deg"], optical["ndvi"], vv_strip
            )
            features_strip.update(neighborhood)

            # trim the overlap buffer back off before writing
            trim_top = row - read_start
            trim_bottom = trim_top + (row_end - row)

            write_window = rasterio.windows.Window(0, row, full_width, row_end - row)
            for band_idx, name in enumerate(sample_names, start=1):
                trimmed = features_strip[name][trim_top:trim_bottom, :]
                dst.write(trimmed.astype(np.float32), band_idx, window=write_window)

            del dem_strip, vv_strip, vh_strip, s2_strip, features_strip, topo, optical, sar, neighborhood
            row = row_end

    # Only reached if EVERY strip wrote successfully with no exception -
    # NOW it's safe to make this the "real" filename that skip-checks
    # will trust.
    tmp_output_path.rename(output_path)

    print(f"  Saved {len(sample_names)} feature bands to {output_path}")
    return output_path


def _get_feature_names():
    """The fixed list and order of every feature band that will be written."""
    return (
        ["raw_z"] +
        ["slope_deg", "aspect_sin", "aspect_cos", "tri", "tpi",
         "relative_slope_position", "planform_curvature", "profile_curvature",
         "general_curvature", "hillshade", "elevation_gradient"] +
        ["ndvi", "ndwi", "ndsi", "evi", "shadow_index", "bsi"] +
        [f"band_{b}" for b in ["B02", "B03", "B04", "B08", "B11", "B12"]] +
        ["vv", "vh", "vv_vh_ratio", "vv_vh_diff", "vv_texture_std", "vh_texture_std",
         "vv_texture_contrast", "vh_texture_contrast", "radar_layover_flag", "radar_shadow_flag"] +
        ["elev_mean_3x3", "elev_std_3x3", "elev_min_3x3", "elev_max_3x3",
         "slope_mean_5x5", "slope_std_5x5", "ndvi_mean_3x3", "vv_std_3x3",
         "local_roughness_entropy"]
    )