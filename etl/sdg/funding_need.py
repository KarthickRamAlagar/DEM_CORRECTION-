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
# sdg18b: district household size
import re as _re
def _norm(s): return _re.sub(r"[^a-z0-9]", "", str(s).lower())
_ALIAS = {"prayagraj": "allahabad", "ayodhya": "faizabad", "maharajganj": "mahrajganj", "lakhimpurkheri": "kheri", "kasganj": "kanshiramnagar",
          "amroha": "jyotibaphulenagar", "hathras": "mahamayanagar", "kaimur": "kaimurbhabua", "purnea": "purnia", "samastipur": "samastipur"}
def _census_map():
    c = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(a.config)), "census2011_household_size.csv"))
    return {_norm(r.district_2011): float(r.people_per_household) for r in c.itertuples()}
def _district_size(names, cm):
    out, miss = [], []
    for n in names:
        k = _ALIAS.get(_norm(n), _norm(n)); v = cm.get(k)
        if v is None and k: v = next((vv for kk, vv in cm.items() if kk.startswith(k) or k.startswith(kk)), None)
        out.append(v)
        if v is None: miss.append(n)
    return pd.Series(out, index=names.index, dtype=float), sorted(set(miss))
# district_id is not in this table: key on iso+name+area (names repeat: Nepal Bara, Saptari)
d["district_key"] = d.iso + "|" + d.district + "|" + d.district_area_km2.round(1).astype(str)
assert d.groupby(["district_key", "year", "bound"]).size().max() == 1, "district_key not unique"
rows = []
for iso, g in d.groupby("iso"):
    c = cfg[iso]; hs = c["household_size"]; rc = c["relief_cash_per_household"]; cp = c["crop_per_ha"]; hf = c["house_fully_damaged"]
    g = g.copy()
    hs_lo, hs_hi = pd.Series(float(hs["low"]), index=g.index), pd.Series(float(hs["high"]), index=g.index)
    if iso == "IND":                                                           # sdg18b: each district's own Census 2011 value (Uttar Pradesh, Bihar); config range only where no match
        v, miss = _district_size(g.district, _census_map())
        hs_lo, hs_hi = v.fillna(hs_lo), v.fillna(hs_hi)
        print("India districts with their own Census 2011 household size:", int(v.notna().groupby(g.district).any().sum()), "| using the config range instead:", ", ".join(miss) or "none")
    hh_lo, hh_hi = g.pop_exposed / hs_hi, g.pop_exposed / hs_lo               # more persons per household -> fewer households
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
