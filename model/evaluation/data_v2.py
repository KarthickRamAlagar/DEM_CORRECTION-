"""Loads the golden dataset once and attaches spatial fold ids. Used by all v2 evaluation/training scripts."""
import os, sys
from pathlib import Path
import numpy as np, pandas as pd
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "helpers")); sys.path.insert(0, str(HERE))
from spatial_split_v2 import assign_folds
from features_v2 import TARGET

def dataset_path():
    p = os.environ.get("DEM_DATASET_PATH")
    if p: return Path(p)
    sys.path.insert(0, str(HERE.parent.parent / "src"))
    from dem_correction.config import DATA_FINAL
    return DATA_FINAL / "golden_dataset.parquet"

def load():
    cache = os.environ.get("DEM_CACHE")
    if cache and Path(cache).exists():
        df = pd.read_pickle(cache)
    else:
        df = pd.read_parquet(dataset_path())
        fold, block_s, uniq, block_fold = assign_folds(df)
        df["_fold"] = fold
        if cache: df.to_pickle(cache)
    return df

def split_objects(df):
    fold, block_s, uniq, block_fold = assign_folds(df)
    return fold, block_s, uniq, block_fold
