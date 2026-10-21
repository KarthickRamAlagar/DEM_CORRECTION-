"""Estimated recovery need per district-year from observed-flood exposure x documented unit costs.
Label: estimated recovery need, NOT a release decision, NOT a forecast. Reads only the exposure table + funding_config.json.
Usage: uv run python -I -u etl/sdg/funding_need.py [--exposure PATH] [--out PATH]"""
import sys, json, argparse, os
import pandas as pd, numpy as np
sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("--exposure", default="data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv")
ap.add_argument("--config", default="etl/sdg/funding_config.json")
ap.add_argument("--out", default="data/processed/sdg/funding/funding_need_by_district_year.csv")
a = ap.parse_args()
cfg = json.load(open(a.config, encoding="utf-8")); FX = cfg["inr_to_npr"]["value"]
d = pd.read_csv(a.exposure)
# district_id is not in this table: key on iso+name+area (names repeat: Nepal Bara, Saptari)
d["district_key"] = d.iso + "|" + d.district + "|" + d.district_area_km2.round(1).astype(str)
assert d.groupby(["district_key", "year", "bound"]).size().max() == 1, "district_key not unique"
rows = []
for iso, g in d.groupby("iso"):
    c = cfg[iso]; hs = c["household_size"]; rc = c["relief_cash_per_household"]; cp = c["crop_per_ha"]; hf = c["house_fully_damaged"]
    g = g.copy()
    hh_lo, hh_hi = g.pop_exposed / hs["high"], g.pop_exposed / hs["low"]      # more persons per household -> fewer households
    rc_lo, rc_hi = rc.get("low", rc.get("value")), rc.get("high", rc.get("value"))
    g["households_min"], g["households_max"] = hh_lo, hh_hi
    g["relief_cash_min"], g["relief_cash_max"] = hh_lo * rc_lo, hh_hi * rc_hi
    if cp: g["crop_min"], g["crop_max"] = g.cropland_ha_exposed * cp["low"], g.cropland_ha_exposed * cp["high"]
    else:  g["crop_min"], g["crop_max"] = np.nan, np.nan                        # no documented rate: No data
    g["need_min"] = g.relief_cash_min + g.crop_min.fillna(0)
    g["need_max"] = g.relief_cash_max + g.crop_max.fillna(0)
    g["housing_ceiling"] = hh_hi * hf["value"]                                  # separate line: IF every exposed household lost its house. NOT added to need.
    g["currency"] = c["currency"]; g["to_inr"] = 1.0 if iso == "IND" else 1.0 / FX
    rows.append(g)
o = pd.concat(rows)
for k in ("relief_cash_min", "relief_cash_max", "crop_min", "crop_max", "need_min", "need_max", "housing_ceiling"):
    o[k + "_inr"] = o[k] * o.to_inr
keep = ["district_key", "iso", "district", "share_in_region", "gfm_coverage", "year", "bound", "pop_exposed", "cropland_ha_exposed", "households_min", "households_max",
        "relief_cash_min", "relief_cash_max", "crop_min", "crop_max", "need_min", "need_max", "housing_ceiling", "currency", "need_min_inr", "need_max_inr", "housing_ceiling_inr"]
os.makedirs(os.path.dirname(a.out), exist_ok=True); o[keep].to_csv(a.out, index=False); print("wrote", a.out, len(o), "rows")
cov = o[(o.gfm_coverage >= 0.99)]
print("\nCovered districts (GFM >=99%); crore INR (1 crore = 10^7); Nepal converted at", FX, "NPR/INR. Need = relief cash + crop input subsidy (Nepal: relief cash only).")
for iso in ("IND", "NPL"):
    x = cov[cov.iso == iso]
    t = x.groupby(["bound", "year"])[["need_min_inr", "need_max_inr", "housing_ceiling_inr"]].sum() / 1e7
    print(f"\n{iso}: districts {x.district_key.nunique()}"); print(t.round(1).to_string())
