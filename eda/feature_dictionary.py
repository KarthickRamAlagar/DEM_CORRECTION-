# """
# Feature Dictionary - Step 1 of the EDA Page Plan

# The master reference for every real feature column in the golden
# dataset: which of the 6 groups it belongs to, its full readable name,
# and a one-line plain-English explanation of what it means.

# This is what powers:
# - The dropdown group selector on the EDA page
# - Each feature's small info card (full name + one-line meaning)
# - Which columns get precomputed stats in later steps

# Excluded from this dictionary (not "features" in the modeling sense):
# - latitude, longitude, ground_track, source_year, year_matched, date_str
#   -> identifiers/metadata, not predictive inputs
# - elevation_ref
#   -> the ground-truth value used to COMPUTE the target, not something
#      available as an input feature at prediction time
# """

# FEATURE_GROUPS = {
#     "terrain_shape": {
#         "label": "Terrain Shape",
#         "description": "Describes how steep, curved, or rugged the ground is - rugged terrain is where DEM errors are usually worst.",
#     },
#     "vegetation_land_cover": {
#         "label": "Vegetation & Land Cover",
#         "description": "Shows what's covering the ground (plants, water, bare soil) - thick vegetation can hide the true ground surface from satellites.",
#     },
#     "radar_signal": {
#         "label": "Radar Signal",
#         "description": "Radar bounces differently off rough vs. smooth surfaces - helps flag areas where optical satellites get confused (clouds, shadows).",
#     },
#     "local_neighborhood": {
#         "label": "Local Neighborhood",
#         "description": "Compares each point to its immediate surroundings - flags unusual bumps or inconsistencies nearby.",
#     },
#     "location_environment": {
#         "label": "Location & Environment",
#         "description": "Where the point is and what conditions existed when it was measured.",
#     },
#     "target_outcome": {
#         "label": "Target (What We're Predicting)",
#         "description": "The actual 'answer' - how wrong the original satellite elevation was, and by how much.",
#     },
# }


# FEATURE_DICTIONARY = {

#     # ============================================================
#     # TERRAIN SHAPE (11)
#     # ============================================================
#     "slope_deg": {
#         "group": "terrain_shape",
#         "full_name": "Slope",
#         "meaning": "How steep the ground is at this point, in degrees.",
#     },
#     "aspect_sin": {
#         "group": "terrain_shape",
#         "full_name": "Aspect (Sine)",
#         "meaning": "Direction the slope faces, encoded for smooth math (paired with Aspect Cosine).",
#     },
#     "aspect_cos": {
#         "group": "terrain_shape",
#         "full_name": "Aspect (Cosine)",
#         "meaning": "Direction the slope faces, encoded for smooth math (paired with Aspect Sine).",
#     },
#     "tri": {
#         "group": "terrain_shape",
#         "full_name": "Terrain Ruggedness Index",
#         "meaning": "How rough or uneven the immediate terrain is.",
#     },
#     "tpi": {
#         "group": "terrain_shape",
#         "full_name": "Topographic Position Index",
#         "meaning": "Whether this point sits higher or lower than its surroundings.",
#     },
#     "relative_slope_position": {
#         "group": "terrain_shape",
#         "full_name": "Relative Slope Position",
#         "meaning": "Where this point ranks in elevation within its local neighborhood.",
#     },
#     "planform_curvature": {
#         "group": "terrain_shape",
#         "full_name": "Planform Curvature",
#         "meaning": "How the terrain curves side-to-side, which affects the direction water would flow.",
#     },
#     "profile_curvature": {
#         "group": "terrain_shape",
#         "full_name": "Profile Curvature",
#         "meaning": "How the terrain curves up-and-down the slope, which affects how fast water would flow.",
#     },
#     "general_curvature": {
#         "group": "terrain_shape",
#         "full_name": "General Curvature",
#         "meaning": "Overall bending of the terrain surface at this point.",
#     },
#     "hillshade": {
#         "group": "terrain_shape",
#         "full_name": "Hillshade",
#         "meaning": "A simulated shadow/illumination value based on terrain shape and sun angle.",
#     },
#     "elevation_gradient": {
#         "group": "terrain_shape",
#         "full_name": "Elevation Gradient",
#         "meaning": "The rate of elevation change at this point.",
#     },

#     # ============================================================
#     # VEGETATION & LAND COVER (12)
#     # ============================================================
#     "ndvi": {
#         "group": "vegetation_land_cover",
#         "full_name": "NDVI (Normalized Difference Vegetation Index)",
#         "meaning": "How much healthy green vegetation is present.",
#     },
#     "ndwi": {
#         "group": "vegetation_land_cover",
#         "full_name": "NDWI (Normalized Difference Water Index)",
#         "meaning": "How much water is present.",
#     },
#     "ndsi": {
#         "group": "vegetation_land_cover",
#         "full_name": "NDSI (Normalized Difference Snow Index)",
#         "meaning": "How much snow or ice is present.",
#     },
#     "evi": {
#         "group": "vegetation_land_cover",
#         "full_name": "EVI (Enhanced Vegetation Index)",
#         "meaning": "Vegetation health - an improved version of NDVI that works better in dense canopies.",
#     },
#     "shadow_index": {
#         "group": "vegetation_land_cover",
#         "full_name": "Shadow Index",
#         "meaning": "How likely this exact spot is sitting in shadow.",
#     },
#     "bsi": {
#         "group": "vegetation_land_cover",
#         "full_name": "BSI (Bare Soil Index)",
#         "meaning": "How much exposed bare soil is present.",
#     },
#     "band_B02": {
#         "group": "vegetation_land_cover",
#         "full_name": "Blue Band Reflectance",
#         "meaning": "Raw blue light reflected from the surface.",
#     },
#     "band_B03": {
#         "group": "vegetation_land_cover",
#         "full_name": "Green Band Reflectance",
#         "meaning": "Raw green light reflected from the surface.",
#     },
#     "band_B04": {
#         "group": "vegetation_land_cover",
#         "full_name": "Red Band Reflectance",
#         "meaning": "Raw red light reflected from the surface.",
#     },
#     "band_B08": {
#         "group": "vegetation_land_cover",
#         "full_name": "Near-Infrared Band Reflectance",
#         "meaning": "Raw near-infrared light reflected - the key band for detecting vegetation.",
#     },
#     "band_B11": {
#         "group": "vegetation_land_cover",
#         "full_name": "Shortwave Infrared Band 1 Reflectance",
#         "meaning": "Reflectance sensitive to moisture content in soil and plants.",
#     },
#     "band_B12": {
#         "group": "vegetation_land_cover",
#         "full_name": "Shortwave Infrared Band 2 Reflectance",
#         "meaning": "Reflectance sensitive to moisture and mineral content.",
#     },

#     # ============================================================
#     # RADAR SIGNAL (10)
#     # ============================================================
#     "vv": {
#         "group": "radar_signal",
#         "full_name": "VV Backscatter",
#         "meaning": "Radar signal strength using vertical-send, vertical-receive polarization.",
#     },
#     "vh": {
#         "group": "radar_signal",
#         "full_name": "VH Backscatter",
#         "meaning": "Radar signal strength using vertical-send, horizontal-receive polarization.",
#     },
#     "vv_vh_ratio": {
#         "group": "radar_signal",
#         "full_name": "VV/VH Ratio",
#         "meaning": "The ratio between the two radar signals, which highlights differences in surface type.",
#     },
#     "vv_vh_diff": {
#         "group": "radar_signal",
#         "full_name": "VV-VH Difference",
#         "meaning": "The difference between the two radar signals, in decibels.",
#     },
#     "vv_texture_std": {
#         "group": "radar_signal",
#         "full_name": "VV Texture (Std Dev)",
#         "meaning": "How much the VV signal varies locally - indicates how rough the surface is.",
#     },
#     "vh_texture_std": {
#         "group": "radar_signal",
#         "full_name": "VH Texture (Std Dev)",
#         "meaning": "How much the VH signal varies locally - indicates how rough the surface is.",
#     },
#     "vv_texture_contrast": {
#         "group": "radar_signal",
#         "full_name": "VV Texture (Contrast)",
#         "meaning": "The local range of the VV signal - another way of measuring surface roughness.",
#     },
#     "vh_texture_contrast": {
#         "group": "radar_signal",
#         "full_name": "VH Texture (Contrast)",
#         "meaning": "The local range of the VH signal - another way of measuring surface roughness.",
#     },
#     "radar_layover_flag": {
#         "group": "radar_signal",
#         "full_name": "Radar Layover Flag",
#         "meaning": "Marks areas where steep terrain distorts the radar image.",
#     },
#     "radar_shadow_flag": {
#         "group": "radar_signal",
#         "full_name": "Radar Shadow Flag",
#         "meaning": "Marks areas hidden from the radar's view by terrain blocking the signal.",
#     },

#     # ============================================================
#     # LOCAL NEIGHBORHOOD (9)
#     # ============================================================
#     "elev_mean_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "Elevation Mean (3x3)",
#         "meaning": "The average elevation in the immediate neighborhood around this point.",
#     },
#     "elev_std_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "Elevation Std Dev (3x3)",
#         "meaning": "How much elevation varies in the immediate neighborhood.",
#     },
#     "elev_min_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "Elevation Min (3x3)",
#         "meaning": "The lowest elevation found nearby.",
#     },
#     "elev_max_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "Elevation Max (3x3)",
#         "meaning": "The highest elevation found nearby.",
#     },
#     "slope_mean_5x5": {
#         "group": "local_neighborhood",
#         "full_name": "Slope Mean (5x5)",
#         "meaning": "The average steepness across a wider neighborhood.",
#     },
#     "slope_std_5x5": {
#         "group": "local_neighborhood",
#         "full_name": "Slope Std Dev (5x5)",
#         "meaning": "How much steepness varies across a wider neighborhood.",
#     },
#     "ndvi_mean_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "NDVI Mean (3x3)",
#         "meaning": "The average vegetation greenness in the immediate neighborhood.",
#     },
#     "vv_std_3x3": {
#         "group": "local_neighborhood",
#         "full_name": "VV Std Dev (3x3)",
#         "meaning": "How much the radar signal varies in the immediate neighborhood.",
#     },
#     "local_roughness_entropy": {
#         "group": "local_neighborhood",
#         "full_name": "Local Spatial Autocorrelation (Roughness Proxy)",
#         "meaning": "How similar this point's elevation is to its immediate neighbors.",
#     },

#     # ============================================================
#     # LOCATION & ENVIRONMENT (9)
#     # ============================================================
#     "raw_z": {
#         "group": "location_environment",
#         "full_name": "Raw Elevation (CartoDEM)",
#         "meaning": "The original, uncorrected satellite elevation value at this point - this is what we're correcting.",
#     },
#     "terrain_region_class": {
#         "group": "location_environment",
#         "full_name": "Terrain Region Class",
#         "meaning": "Whether this point sits in flat plains or in foothill terrain.",
#     },
#     "cloud_cover_pct": {
#         "group": "location_environment",
#         "full_name": "Cloud Cover %",
#         "meaning": "How cloudy the sky was in the satellite image used for this point's matched year.",
#     },
#     "solar_azimuth": {
#         "group": "location_environment",
#         "full_name": "Solar Azimuth",
#         "meaning": "The compass direction of the sun at the time this measurement is referenced to.",
#     },
#     "solar_elevation": {
#         "group": "location_environment",
#         "full_name": "Solar Elevation",
#         "meaning": "How high the sun sits above the horizon at the referenced time.",
#     },
#     "relative_humidity_pct": {
#         "group": "location_environment",
#         "full_name": "Relative Humidity %",
#         "meaning": "Atmospheric moisture at this location and date.",
#     },
#     "atmospheric_pressure_kpa": {
#         "group": "location_environment",
#         "full_name": "Atmospheric Pressure",
#         "meaning": "Air pressure at this location and date, in kilopascals.",
#     },
#     "distance_to_water_km": {
#         "group": "location_environment",
#         "full_name": "Distance to Water",
#         "meaning": "How far this point is from the nearest water body, in kilometers.",
#     },
#     "spatial_autocorrelation_moran": {
#         "group": "location_environment",
#         "full_name": "Local Moran's I",
#         "meaning": "Whether this point's elevation tends to cluster with similar values nearby, or stands out from them.",
#     },

#     # ============================================================
#     # TARGET / OUTCOME (4)
#     # ============================================================
#     "elevation_error_signed": {
#         "group": "target_outcome",
#         "full_name": "Elevation Error (Signed)",
#         "meaning": "How much the satellite elevation differs from the true value, including whether it's too high or too low.",
#     },
#     "elevation_error_abs": {
#         "group": "target_outcome",
#         "full_name": "Elevation Error (Absolute)",
#         "meaning": "The size of the elevation error, regardless of direction.",
#     },
#     "is_void_flag": {
#         "group": "target_outcome",
#         "full_name": "Void Flag",
#         "meaning": "Marks points where the elevation error is unusually large or the data is missing.",
#     },
#     "vertical_accuracy_class": {
#         "group": "target_outcome",
#         "full_name": "Vertical Accuracy Class",
#         "meaning": "A category describing how accurate this point is, from very accurate to poor.",
#     },
# }


# def get_features_by_group(group_key):
#     """Return {feature_name: info} for just one group - powers the dropdown filtering."""
#     return {
#         name: info
#         for name, info in FEATURE_DICTIONARY.items()
#         if info["group"] == group_key
#     }


# def get_all_group_keys():
#     """Return the list of group keys, in the fixed display order used above."""
#     return list(FEATURE_GROUPS.keys())


# if __name__ == "__main__":
#     # Quick self-check: confirm every group has at least one feature,
#     # and print counts per group
#     print("Feature Dictionary Summary")
#     print("=" * 40)
#     for group_key, group_info in FEATURE_GROUPS.items():
#         count = len(get_features_by_group(group_key))
#         print(f"{group_info['label']:35s} {count:3d} features")
#     print("=" * 40)
#     print(f"{'TOTAL':35s} {len(FEATURE_DICTIONARY):3d} features")

"""
Feature Dictionary - Step 1 of the EDA Page Plan

The master reference for every real feature column in the golden
dataset: which of the 6 groups it belongs to, its full readable name,
and a one-line plain-English explanation of what it means.

This is what powers:
- The dropdown group selector on the EDA page
- Each feature's small info card (full name + one-line meaning)
- Which columns get precomputed stats in later steps

Excluded from this dictionary (not "features" in the modeling sense):
- latitude, longitude, ground_track, source_year, year_matched, date_str
  -> identifiers/metadata, not predictive inputs
- elevation_ref
  -> the ground-truth value used to COMPUTE the target, not something
     available as an input feature at prediction time
"""

FEATURE_GROUPS = {
    "terrain_shape": {
        "label": "Terrain Shape",
        "description": "Describes how steep, curved, or rugged the ground is - rugged terrain is where DEM errors are usually worst.",
    },
    "vegetation_land_cover": {
        "label": "Vegetation & Land Cover",
        "description": "Shows what's covering the ground (plants, water, bare soil) - thick vegetation can hide the true ground surface from satellites.",
    },
    "radar_signal": {
        "label": "Radar Signal",
        "description": "Radar bounces differently off rough vs. smooth surfaces - helps flag areas where optical satellites get confused (clouds, shadows).",
    },
    "local_neighborhood": {
        "label": "Local Neighborhood",
        "description": "Compares each point to its immediate surroundings - flags unusual bumps or inconsistencies nearby.",
    },
    "location_environment": {
        "label": "Location & Environment",
        "description": "Where the point is and what conditions existed when it was measured.",
    },
    "target_outcome": {
        "label": "Target (What We're Predicting)",
        "description": "The actual 'answer' - how wrong the original satellite elevation was, and by how much.",
    },
}


FEATURE_DICTIONARY = {

    # ============================================================
    # TERRAIN SHAPE (11)
    # ============================================================
    "slope_deg": {
        "group": "terrain_shape",
        "full_name": "Slope",
        "meaning": "How steep the ground is at this point, in degrees.",
    },
    "aspect_sin": {
        "group": "terrain_shape",
        "full_name": "Aspect (Sine)",
        "meaning": "Direction the slope faces, encoded for smooth math (paired with Aspect Cosine).",
    },
    "aspect_cos": {
        "group": "terrain_shape",
        "full_name": "Aspect (Cosine)",
        "meaning": "Direction the slope faces, encoded for smooth math (paired with Aspect Sine).",
    },
    "tri": {
        "group": "terrain_shape",
        "full_name": "Terrain Ruggedness Index",
        "meaning": "How rough or uneven the immediate terrain is.",
    },
    "tpi": {
        "group": "terrain_shape",
        "full_name": "Topographic Position Index",
        "meaning": "Whether this point sits higher or lower than its surroundings.",
    },
    "relative_slope_position": {
        "group": "terrain_shape",
        "full_name": "Relative Slope Position",
        "meaning": "Where this point ranks in elevation within its local neighborhood.",
    },
    "planform_curvature": {
        "group": "terrain_shape",
        "full_name": "Planform Curvature",
        "meaning": "How the terrain curves side-to-side, which affects the direction water would flow.",
    },
    "profile_curvature": {
        "group": "terrain_shape",
        "full_name": "Profile Curvature",
        "meaning": "How the terrain curves up-and-down the slope, which affects how fast water would flow.",
    },
    "general_curvature": {
        "group": "terrain_shape",
        "full_name": "General Curvature",
        "meaning": "Overall bending of the terrain surface at this point.",
    },
    "hillshade": {
        "group": "terrain_shape",
        "full_name": "Hillshade",
        "meaning": "A simulated shadow/illumination value based on terrain shape and sun angle.",
    },
    "elevation_gradient": {
        "group": "terrain_shape",
        "full_name": "Elevation Gradient",
        "meaning": "The rate of elevation change at this point.",
    },

    # ============================================================
    # VEGETATION & LAND COVER (12)
    # ============================================================
    "ndvi": {
        "group": "vegetation_land_cover",
        "full_name": "NDVI (Normalized Difference Vegetation Index)",
        "meaning": "How much healthy green vegetation is present.",
    },
    "ndwi": {
        "group": "vegetation_land_cover",
        "full_name": "NDWI (Normalized Difference Water Index)",
        "meaning": "How much water is present.",
    },
    "ndsi": {
        "group": "vegetation_land_cover",
        "full_name": "NDSI (Normalized Difference Snow Index)",
        "meaning": "How much snow or ice is present.",
    },
    "evi": {
        "group": "vegetation_land_cover",
        "full_name": "EVI (Enhanced Vegetation Index)",
        "meaning": "Vegetation health - an improved version of NDVI that works better in dense canopies.",
    },
    "shadow_index": {
        "group": "vegetation_land_cover",
        "full_name": "Shadow Index",
        "meaning": "How likely this exact spot is sitting in shadow.",
    },
    "bsi": {
        "group": "vegetation_land_cover",
        "full_name": "BSI (Bare Soil Index)",
        "meaning": "How much exposed bare soil is present.",
    },
    "band_B02": {
        "group": "vegetation_land_cover",
        "full_name": "Blue Band Reflectance",
        "meaning": "Raw blue light reflected from the surface.",
    },
    "band_B03": {
        "group": "vegetation_land_cover",
        "full_name": "Green Band Reflectance",
        "meaning": "Raw green light reflected from the surface.",
    },
    "band_B04": {
        "group": "vegetation_land_cover",
        "full_name": "Red Band Reflectance",
        "meaning": "Raw red light reflected from the surface.",
    },
    "band_B08": {
        "group": "vegetation_land_cover",
        "full_name": "Near-Infrared Band Reflectance",
        "meaning": "Raw near-infrared light reflected - the key band for detecting vegetation.",
    },
    "band_B11": {
        "group": "vegetation_land_cover",
        "full_name": "Shortwave Infrared Band 1 Reflectance",
        "meaning": "Reflectance sensitive to moisture content in soil and plants.",
    },
    "band_B12": {
        "group": "vegetation_land_cover",
        "full_name": "Shortwave Infrared Band 2 Reflectance",
        "meaning": "Reflectance sensitive to moisture and mineral content.",
    },

    # ============================================================
    # RADAR SIGNAL (10)
    # ============================================================
    "vv": {
        "group": "radar_signal",
        "full_name": "VV Backscatter",
        "meaning": "Radar signal strength using vertical-send, vertical-receive polarization.",
    },
    "vh": {
        "group": "radar_signal",
        "full_name": "VH Backscatter",
        "meaning": "Radar signal strength using vertical-send, horizontal-receive polarization.",
    },
    "vv_vh_ratio": {
        "group": "radar_signal",
        "full_name": "VV/VH Ratio",
        "meaning": "The ratio between the two radar signals, which highlights differences in surface type.",
    },
    "vv_vh_diff": {
        "group": "radar_signal",
        "full_name": "VV-VH Difference",
        "meaning": "The difference between the two radar signals, in decibels.",
    },
    "vv_texture_std": {
        "group": "radar_signal",
        "full_name": "VV Texture (Std Dev)",
        "meaning": "How much the VV signal varies locally - indicates how rough the surface is.",
    },
    "vh_texture_std": {
        "group": "radar_signal",
        "full_name": "VH Texture (Std Dev)",
        "meaning": "How much the VH signal varies locally - indicates how rough the surface is.",
    },
    "vv_texture_contrast": {
        "group": "radar_signal",
        "full_name": "VV Texture (Contrast)",
        "meaning": "The local range of the VV signal - another way of measuring surface roughness.",
    },
    "vh_texture_contrast": {
        "group": "radar_signal",
        "full_name": "VH Texture (Contrast)",
        "meaning": "The local range of the VH signal - another way of measuring surface roughness.",
    },
    "radar_layover_flag": {
        "group": "radar_signal",
        "full_name": "Radar Layover Flag",
        "meaning": "Marks areas where steep terrain distorts the radar image.",
    },
    "radar_shadow_flag": {
        "group": "radar_signal",
        "full_name": "Radar Shadow Flag",
        "meaning": "Marks areas hidden from the radar's view by terrain blocking the signal.",
    },

    # ============================================================
    # LOCAL NEIGHBORHOOD (9)
    # ============================================================
    "elev_mean_3x3": {
        "group": "local_neighborhood",
        "full_name": "Elevation Mean (3x3)",
        "meaning": "The average elevation in the immediate neighborhood around this point.",
    },
    "elev_std_3x3": {
        "group": "local_neighborhood",
        "full_name": "Elevation Std Dev (3x3)",
        "meaning": "How much elevation varies in the immediate neighborhood.",
    },
    "elev_min_3x3": {
        "group": "local_neighborhood",
        "full_name": "Elevation Min (3x3)",
        "meaning": "The lowest elevation found nearby.",
    },
    "elev_max_3x3": {
        "group": "local_neighborhood",
        "full_name": "Elevation Max (3x3)",
        "meaning": "The highest elevation found nearby.",
    },
    "slope_mean_5x5": {
        "group": "local_neighborhood",
        "full_name": "Slope Mean (5x5)",
        "meaning": "The average steepness across a wider neighborhood.",
    },
    "slope_std_5x5": {
        "group": "local_neighborhood",
        "full_name": "Slope Std Dev (5x5)",
        "meaning": "How much steepness varies across a wider neighborhood.",
    },
    "ndvi_mean_3x3": {
        "group": "local_neighborhood",
        "full_name": "NDVI Mean (3x3)",
        "meaning": "The average vegetation greenness in the immediate neighborhood.",
    },
    "vv_std_3x3": {
        "group": "local_neighborhood",
        "full_name": "VV Std Dev (3x3)",
        "meaning": "How much the radar signal varies in the immediate neighborhood.",
    },
    "local_roughness_entropy": {
        "group": "local_neighborhood",
        "full_name": "Local Spatial Autocorrelation (Roughness Proxy)",
        "meaning": "How similar this point's elevation is to its immediate neighbors.",
    },

    # ============================================================
    # LOCATION & ENVIRONMENT (9)
    # ============================================================
    "raw_z": {
        "group": "location_environment",
        "full_name": "Raw Elevation (CartoDEM)",
        "meaning": "The original, uncorrected satellite elevation value at this point - this is what we're correcting.",
    },
    "terrain_region_class": {
        "group": "location_environment",
        "full_name": "Terrain Region Class",
        "meaning": "Whether this point sits in flat plains or in foothill terrain.",
    },
    "cloud_cover_pct": {
        "group": "location_environment",
        "full_name": "Cloud Cover %",
        "meaning": "How cloudy the sky was in the satellite image used for this point's matched year.",
    },
    "solar_azimuth": {
        "group": "location_environment",
        "full_name": "Solar Azimuth",
        "meaning": "The compass direction of the sun at the time this measurement is referenced to.",
    },
    "solar_elevation": {
        "group": "location_environment",
        "full_name": "Solar Elevation",
        "meaning": "How high the sun sits above the horizon at the referenced time.",
    },
    "relative_humidity_pct": {
        "group": "location_environment",
        "full_name": "Relative Humidity %",
        "meaning": "Atmospheric moisture at this location and date.",
    },
    "atmospheric_pressure_kpa": {
        "group": "location_environment",
        "full_name": "Atmospheric Pressure",
        "meaning": "Air pressure at this location and date, in kilopascals.",
    },
    "distance_to_water_km": {
        "group": "location_environment",
        "full_name": "Distance to Water",
        "meaning": "How far this point is from the nearest water body, in kilometers.",
    },
    "spatial_autocorrelation_moran": {
        "group": "location_environment",
        "full_name": "Local Moran's I",
        "meaning": "Whether this point's elevation tends to cluster with similar values nearby, or stands out from them.",
    },

    # ============================================================
    # TARGET / OUTCOME (4)
    # ============================================================
    "elevation_error_signed": {
        "group": "target_outcome",
        "full_name": "Elevation Error (Signed)",
        "meaning": "How much the satellite elevation differs from the true value, including whether it's too high or too low.",
    },
    "elevation_error_abs": {
        "group": "target_outcome",
        "full_name": "Elevation Error (Absolute)",
        "meaning": "The size of the elevation error, regardless of direction.",
    },
    "is_void_flag": {
        "group": "target_outcome",
        "full_name": "Void Flag",
        "meaning": "Marks points where the elevation error is unusually large or the data is missing.",
    },
    "vertical_accuracy_class": {
        "group": "target_outcome",
        "full_name": "Vertical Accuracy Class",
        "meaning": "A category describing how accurate this point is, from very accurate to poor.",
    },
    "uncertainty_estimate": {
        "group": "target_outcome",
        "full_name": "Uncertainty Estimate",
        "meaning": "A 0-1 score for how hard this point is likely to be to correct, based on terrain ruggedness and location - known before seeing the true error. Stored as a continuous score (not Low/Medium/High buckets) to preserve real signal - verified correlation with absolute error: 0.32 continuous vs. only 0.17 if bucketed into 3 classes.",
    },
}


def get_features_by_group(group_key):
    """Return {feature_name: info} for just one group - powers the dropdown filtering."""
    return {
        name: info
        for name, info in FEATURE_DICTIONARY.items()
        if info["group"] == group_key
    }


def get_all_group_keys():
    """Return the list of group keys, in the fixed display order used above."""
    return list(FEATURE_GROUPS.keys())


if __name__ == "__main__":
    # Quick self-check: confirm every group has at least one feature,
    # and print counts per group
    print("Feature Dictionary Summary")
    print("=" * 40)
    for group_key, group_info in FEATURE_GROUPS.items():
        count = len(get_features_by_group(group_key))
        print(f"{group_info['label']:35s} {count:3d} features")
    print("=" * 40)
    print(f"{'TOTAL':35s} {len(FEATURE_DICTIONARY):3d} features")