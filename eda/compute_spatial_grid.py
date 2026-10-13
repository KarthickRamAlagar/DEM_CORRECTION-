"""
Precompute Spatial Grid + Hexbin - Step 6 of the EDA Page Plan

Plotting 1.2 million individual points on a map is slow and unreadable
(they'd overlap into a solid blob anyway). Instead, we aggregate points
into small area cells and save just the cell centers + average values -
this is a "Density Plot" and a "Hexbin Plot" from the reference list.

Two outputs:
1. Square grid heatmap - simple, fast, easy to reason about
2. Hexagonal bin aggregation - tiles more evenly than squares, standard
   choice for point-density spatial EDA

Run: uv run python eda/compute_spatial_grid.py
"""

import sys
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from dem_correction.config import DATA_FINAL, STUDY_BBOX

DATASET_PATH = DATA_FINAL / "golden_dataset.parquet"
OUTPUT_DIR = Path(__file__).parent / "precomputed"

# The columns worth seeing on a map - not all 55, just the ones that
# tell a spatial story on their own
SPATIAL_VALUE_COLUMNS = ["raw_z", "elevation_error_signed", "ndvi", "slope_deg"]

GRID_CELL_SIZE_DEG = 0.05   # ~5.5km cells at this latitude
HEX_RADIUS_DEG = 0.05


def compute_square_grid(df):
    west, south, east, north = STUDY_BBOX
    df = df.copy()
    df["_col"] = ((df["longitude"] - west) / GRID_CELL_SIZE_DEG).astype(int)
    df["_row"] = ((df["latitude"] - south) / GRID_CELL_SIZE_DEG).astype(int)

    grouped = df.groupby(["_row", "_col"])
    cells = []
    for (row, col), group in grouped:
        cell = {
            "lat_center": south + (row + 0.5) * GRID_CELL_SIZE_DEG,
            "lon_center": west + (col + 0.5) * GRID_CELL_SIZE_DEG,
            "point_count": int(len(group)),
        }
        for col_name in SPATIAL_VALUE_COLUMNS:
            valid = group[col_name].dropna()
            cell[f"{col_name}_mean"] = float(valid.mean()) if len(valid) > 0 else None
        cells.append(cell)
    return cells


def axial_hex_coords(lon, lat, radius):
    """
    Convert lon/lat into axial hex grid coordinates (pointy-top hexes).
    Standard axial coordinate conversion, using `radius` as the hex size
    in degrees.
    """
    q = (math.sqrt(3) / 3 * lon - 1 / 3 * lat) / radius
    r = (2 / 3 * lat) / radius
    return round(q), round(r)


def compute_hexbin(df, radius=HEX_RADIUS_DEG):
    df = df.copy()
    hex_coords = [axial_hex_coords(lon, lat, radius) for lon, lat in zip(df["longitude"], df["latitude"])]
    df["_hex_q"] = [c[0] for c in hex_coords]
    df["_hex_r"] = [c[1] for c in hex_coords]

    grouped = df.groupby(["_hex_q", "_hex_r"])
    hexes = []
    for (q, r), group in grouped:
        # convert axial hex coords back to approximate lon/lat center,
        # for placing the hex on the map
        lon_center = radius * (math.sqrt(3) * q + math.sqrt(3) / 2 * r)
        lat_center = radius * (3 / 2 * r)
        hexcell = {
            "lon_center": lon_center,
            "lat_center": lat_center,
            "point_count": int(len(group)),
        }
        for col_name in SPATIAL_VALUE_COLUMNS:
            valid = group[col_name].dropna()
            hexcell[f"{col_name}_mean"] = float(valid.mean()) if len(valid) > 0 else None
        hexes.append(hexcell)
    return hexes


def main():
    print("=" * 60)
    print("PRECOMPUTING SPATIAL GRID + HEXBIN")
    print("=" * 60)

    needed_cols = ["latitude", "longitude"] + SPATIAL_VALUE_COLUMNS
    df = pd.read_parquet(DATASET_PATH, columns=needed_cols)
    print(f"Loaded {len(df):,} rows")

    print(f"\nComputing square grid ({GRID_CELL_SIZE_DEG} deg cells)...")
    grid_cells = compute_square_grid(df)
    print(f"  {len(grid_cells)} grid cells")

    print(f"\nComputing hexbin ({HEX_RADIUS_DEG} deg hex radius)...")
    hex_cells = compute_hexbin(df)
    print(f"  {len(hex_cells)} hex cells")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "spatial_grid.json", "w") as f:
        json.dump({"cell_size_deg": GRID_CELL_SIZE_DEG, "cells": grid_cells}, f, indent=2)
    with open(OUTPUT_DIR / "spatial_hexbin.json", "w") as f:
        json.dump({"hex_radius_deg": HEX_RADIUS_DEG, "cells": hex_cells}, f, indent=2)

    print(f"\nDONE - saved to {OUTPUT_DIR}/spatial_grid.json and spatial_hexbin.json")


if __name__ == "__main__":
    main()