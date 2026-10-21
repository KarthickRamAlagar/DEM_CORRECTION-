"""
sdg_routes.py - read-only SDG impact API (India + Nepal Terai), /api/sdg/*.

Reads only small tables produced by etl/sdg (exposure + funding-need CSVs) and etl/sdg/funding_config.json.
Nothing is computed from placeholders: a missing value is returned as null and the page shows "No data".
Everything here is OBSERVED flood exposure x documented unit costs = estimated recovery need.
It is NOT a forecast and NOT a release decision.
"""
import json
import math
from pathlib import Path
from fastapi import APIRouter, HTTPException

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EXPOSURE_CSV = ROOT / "data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv"
FUNDING_CSV = ROOT / "data/processed/sdg/funding/funding_need_by_district_year.csv"
CONFIG_JSON = ROOT / "etl/sdg/funding_config.json"
EVER = "2019-2026 ever"
COVER_MIN = 0.99

router = APIRouter(prefix="/api/sdg", tags=["sdg"])

BOUND_LABELS = {
    "lower_unflagged": "Conservative: unflagged satellite scenes only",
    "upper_union": "Upper: unflagged plus flagged scenes (follows rainfall better)",
}

LIMITATIONS = [
    "Observed flood extent from Copernicus GFM (Sentinel-1 radar). It is weak under dense vegetation, in cities and on flat sand, so real flooding is probably higher in those places.",
    "Two bounds are shown because the radar service flags some scenes. The rainfall check suggests flagged scenes carry real flood signal (plausibility check, not proof).",
    "Exposure is people, cropland and buildings inside the observed flood footprint. It is not casualties and not damage.",
    "The corrected DEM did not measurably improve flood-extent skill with the nearest-channel method used here. Nothing on this page claims it does.",
    "Population is a 2020 WorldPop modelled snapshot. Cropland is ESA WorldCover 2021 class 40 (no crop type or yield).",
    "Recovery need = relief cash per household + crop input subsidy per hectare (India only). Crop subsidy applies only where crop loss is 33% or more, so the crop line is a ceiling.",
    "Housing is shown separately as a ceiling (every exposed household loses its house) and is never added to the need.",
    "India unit costs: 2022-26 values read from a state-department copy of the MHA letter of 10 Oct 2022 (partly verified). Nepal amounts were read by eye from a scanned 2077 BS standard and need a Nepali reader.",
    "Districts with less than 99% satellite coverage are left out of totals by default. Only the part of a district inside the study region is counted.",
    "This is a decision-support estimate of recovery need. It does not authorise any release of funds.",
]

_cache = {}


def _clean(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _records(df):
    out = []
    for r in df.to_dict(orient="records"):
        out.append({k: _clean(v) for k, v in r.items()})
    return out


def _load():
    """Load and join the two tables once (re-read if a file changed)."""
    if not EXPOSURE_CSV.exists() or not FUNDING_CSV.exists():
        raise HTTPException(503, "SDG tables not found. Run etl/sdg/exposure_region.py and etl/sdg/funding_need.py first.")
    stamp = (EXPOSURE_CSV.stat().st_mtime, FUNDING_CSV.stat().st_mtime)
    if _cache.get("stamp") == stamp:
        return _cache["df"]
    e = pd.read_csv(EXPOSURE_CSV)
    e["district_key"] = e.iso + "|" + e.district + "|" + e.district_area_km2.round(1).astype(str)
    f = pd.read_csv(FUNDING_CSV)
    extra = e[["district_key", "year", "bound", "flooded_km2", "buildings_exposed", "bldg_coverage", "district_pop", "district_cropland_ha", "district_area_km2",
               "pct_area", "pct_pop", "pct_cropland"]]
    df = f.merge(extra, on=["district_key", "year", "bound"], how="left", validate="one_to_one")
    df["year"] = df["year"].astype(str)
    _cache.update(stamp=stamp, df=df)
    return df


def _select(country, year, covered_only):
    df = _load()
    if country not in ("IND", "NPL"):
        raise HTTPException(400, "country must be IND or NPL")
    y = EVER if year == "ever" else str(year)
    if y not in set(df.year):
        raise HTTPException(400, f"year must be 'ever' or one of {sorted(set(df.year) - {EVER})}")
    d = df[(df.iso == country) & (df.year == y)]
    n_all = d.district_key.nunique()
    if covered_only:
        d = d[d.gfm_coverage >= COVER_MIN]
    return d, n_all


def _sum(x, col):
    s = x[col]
    return None if s.isna().all() else float(s.sum())


def _buildings_total(x):
    """Building footprints exist only for part of India. Give a total only if EVERY district shown has building data."""
    if x.empty or x.bldg_coverage.isna().any() or (x.bldg_coverage < COVER_MIN).any() or x.buildings_exposed.isna().any():
        return None
    return float(x.buildings_exposed.sum())


def _totals(x):
    return {
        "districts": int(x.district_key.nunique()),
        "flooded_km2": _sum(x, "flooded_km2"),
        "people_exposed": _sum(x, "pop_exposed"),
        "cropland_ha_exposed": _sum(x, "cropland_ha_exposed"),
        "buildings_exposed": _buildings_total(x),
        "buildings_districts_with_data": int((x.bldg_coverage >= COVER_MIN).sum()),
        "households_min": _sum(x, "households_min"),
        "households_max": _sum(x, "households_max"),
        "relief_cash_min": _sum(x, "relief_cash_min"),
        "relief_cash_max": _sum(x, "relief_cash_max"),
        "crop_min": _sum(x, "crop_min"),
        "crop_max": _sum(x, "crop_max"),
        "need_min": _sum(x, "need_min"),
        "need_max": _sum(x, "need_max"),
        "housing_ceiling": _sum(x, "housing_ceiling"),
        "need_min_inr": _sum(x, "need_min_inr"),
        "need_max_inr": _sum(x, "need_max_inr"),
        "housing_ceiling_inr": _sum(x, "housing_ceiling_inr"),
        "district_pop": float(x.drop_duplicates("district_key").district_pop.sum()),
        "district_cropland_ha": float(x.drop_duplicates("district_key").district_cropland_ha.sum()),
    }


@router.get("/meta")
def meta():
    """Labels, assumptions (with status), limitations and available years."""
    df = _load()
    cfg = json.load(open(CONFIG_JSON, encoding="utf-8"))
    years = sorted(set(df.year) - {EVER})
    return {
        "label": "Estimated recovery need from observed flood exposure. Not a forecast. Not a release decision.",
        "years": years,
        "ever_label": "Ever flooded 2019-2026 (combined footprint, not a sum of years)",
        "bounds": BOUND_LABELS,
        "coverage_threshold": COVER_MIN,
        "assumptions": cfg,
        "limitations": LIMITATIONS,
        "region": "India and Nepal Terai, 80.3-86.8 E, 25.0-29.0 N (observed flood exposure). Raw-vs-corrected DEM claims apply only to the core box 80-84 E, 25-28 N.",
        "data_files": {"exposure": EXPOSURE_CSV.name, "funding": FUNDING_CSV.name},
    }


@router.get("/summary")
def summary(country: str = "IND", year: str = "ever", covered_only: bool = True):
    d, n_all = _select(country, year, covered_only)
    out = {"country": country, "year": year, "covered_only": covered_only, "districts_total": n_all, "bounds": {}}
    out["districts_left_out"] = n_all - int(d.district_key.nunique())
    for b in ("lower_unflagged", "upper_union"):
        out["bounds"][b] = {k: _clean(v) for k, v in _totals(d[d.bound == b]).items()}
    out["currency"] = d.currency.iloc[0] if len(d) else None
    return out


@router.get("/yearly")
def yearly(country: str = "IND", covered_only: bool = True):
    df = _load()
    if country not in ("IND", "NPL"):
        raise HTTPException(400, "country must be IND or NPL")
    d = df[(df.iso == country) & (df.year != EVER)]
    if covered_only:
        d = d[d.gfm_coverage >= COVER_MIN]
    rows = []
    for (y, b), x in d.groupby(["year", "bound"]):
        t = _totals(x)
        rows.append({"year": y, "bound": b, **{k: _clean(t[k]) for k in ("people_exposed", "cropland_ha_exposed", "flooded_km2", "need_min", "need_max", "need_min_inr", "need_max_inr")}})
    return {"country": country, "rows": rows}


SORTS = {"people": "pop_exposed", "cropland": "cropland_ha_exposed", "need": "need_max", "area": "flooded_km2", "share_people": "pct_pop"}


@router.get("/districts")
def districts(country: str = "IND", year: str = "ever", bound: str = "upper_union", covered_only: bool = True, sort: str = "people", limit: int = 25):
    if bound not in BOUND_LABELS:
        raise HTTPException(400, f"bound must be one of {list(BOUND_LABELS)}")
    if sort not in SORTS:
        raise HTTPException(400, f"sort must be one of {list(SORTS)}")
    d, _ = _select(country, year, covered_only)
    d = d[d.bound == bound].sort_values(SORTS[sort], ascending=False, na_position="last").head(max(1, min(limit, 200)))
    cols = ["district_key", "district", "district_area_km2", "share_in_region", "gfm_coverage", "flooded_km2", "pop_exposed", "pct_pop", "cropland_ha_exposed", "pct_cropland",
            "buildings_exposed", "bldg_coverage", "households_min", "households_max", "need_min", "need_max", "housing_ceiling", "currency", "need_min_inr", "need_max_inr"]
    return {"country": country, "year": year, "bound": bound, "rows": _records(d[cols])}


# place-based chain, district map and Apple token (separate file)
from .sdg_chain_routes import router as _chain_router  # noqa: E402

router.include_router(_chain_router)
