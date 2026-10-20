"""
tidy_nepal_crops.py - clean the Nepal district cereal table (2014/15).

Run from the project root:
    uv run python -u etl/external/tidy_nepal_crops.py 2>&1 | tee logs/checks/nepal_crops_qc.txt

Reads (never edits):
  data/external/crops/nepal_opendatanepal/area-production-and-yield-of-cereal-crops-in-districts-2014-2015/districts_2014_2015.csv
Writes:
  data/processed/nepal/nepal_crops_2014_15_long.csv   (crop, measure, district, value)
  data/processed/nepal/nepal_crops_2014_15_wide.csv   (district x crop: area_ha, prod_t, yield_kg_ha, checks)

The source file labels two rows wrongly (row 5 says Paddy Area but is Maize Area; row 8 says Maize
Area but is Millet Area). Rows are therefore assigned by POSITION: six crops in the order
Paddy, Maize, Millet, Buckwheat, Wheat, Barley, each as Area, Prod, Yield. The position rule is
then checked with production / area = yield for every district and for the national total.
Units are not written in the file; they are INFERRED as hectares, tonnes, kg per hectare.
"""
import re, sys
from pathlib import Path
import pandas as pd

SRC = Path("data/external/crops/nepal_opendatanepal/area-production-and-yield-of-cereal-crops-in-districts-2014-2015/districts_2014_2015.csv")
OUT = Path("data/processed/nepal")
CROPS = ["Paddy", "Maize", "Millet", "Buckwheat", "Wheat", "Barley"]
MEASURES = ["Area", "Prod", "Yield"]
TOL = 0.03   # 3 % tolerance between yield and production / area (source rounding)


def norm(name):
    return re.sub(r"[^A-Z]", "", str(name).upper())


def main(src=SRC, out=OUT):
    raw = pd.read_csv(src, header=None, dtype=str, encoding="utf-8")
    header = [str(c).strip() for c in raw.iloc[0].tolist()]
    body = raw.iloc[1:].reset_index(drop=True)
    if len(body) != 18:
        sys.exit(f"STOP: expected 18 data rows (6 crops x 3 measures), found {len(body)}")
    if header[-1].upper() != "NEPAL":
        sys.exit("STOP: last column is not NEPAL: " + header[-1])
    districts = header[2:-1]
    print(f"districts: {len(districts)} (plus NEPAL total)")

    long_rows, relabelled = [], []
    for i, row in body.iterrows():
        crop, measure = CROPS[i // 3], MEASURES[i % 3]
        file_crop, file_measure = str(row[0]).strip(), str(row[1]).strip()
        if file_measure.lower() != measure.lower():
            sys.exit(f"STOP: row {i+2} measure label '{file_measure}' does not match position '{measure}'")
        if file_crop.lower() != crop.lower():
            relabelled.append((i + 2, file_crop, measure, crop))
        vals = pd.to_numeric(row[2:].astype(str).str.replace(",", ""), errors="coerce")
        for d, v in zip(districts + ["NEPAL"], vals.tolist()):
            long_rows.append({"crop": crop, "measure": measure, "district": d, "district_key": norm(d), "value": v})
    long = pd.DataFrame(long_rows)
    print("rows whose crop label disagrees with position (fixed by position):")
    for r, fl, m, c in relabelled:
        print(f"  file row {r}: labelled '{fl} {m}' -> assigned '{c} {m}'")

    wide = long.pivot_table(index=["district", "district_key", "crop"], columns="measure", values="value", aggfunc="first").reset_index()
    wide = wide.rename(columns={"Area": "area_ha", "Prod": "prod_t", "Yield": "yield_kg_ha"})
    ok = []
    for _, r in wide.iterrows():
        if pd.isna(r.area_ha) or pd.isna(r.prod_t) or pd.isna(r.yield_kg_ha):
            ok.append("missing")
        elif r.area_ha == 0 and r.prod_t == 0:
            ok.append("zero_area")
        elif r.area_ha == 0:
            ok.append("prod_without_area")
        else:
            expected = r.prod_t * 1000.0 / r.area_ha
            denom = max(abs(expected), 1.0)
            ok.append("ok" if abs(r.yield_kg_ha - expected) / denom <= TOL else "yield_mismatch")
    wide["check"] = ok
    wide["unit_note"] = "ha, tonnes, kg/ha (inferred; units not stated in the source file)"

    nat = wide[wide.district == "NEPAL"]
    dist = wide[wide.district != "NEPAL"]
    print("\nChecks (production/area vs yield, tolerance 3 %):")
    print(dist.groupby(["crop", "check"]).size().unstack(fill_value=0).to_string())
    print("\nNational total check, and sum of districts vs NEPAL column:")
    for crop in CROPS:
        n = nat[nat.crop == crop].iloc[0]
        s = dist[dist.crop == crop][["area_ha", "prod_t"]].sum()
        print(f"  {crop:10s} NEPAL check={n.check:10s} area {n.area_ha:>10,.0f} vs districts {s.area_ha:>10,.0f} ({(s.area_ha-n.area_ha)/n.area_ha:+.1%}) | prod {n.prod_t:>10,.0f} vs {s.prod_t:>10,.0f} ({(s.prod_t-n.prod_t)/n.prod_t:+.1%})")
    bad = dist[dist.check.isin(["yield_mismatch", "prod_without_area", "missing"])]
    if len(bad):
        print(f"\n{len(bad)} district-crop rows need attention (first 15):")
        print(bad[["district", "crop", "area_ha", "prod_t", "yield_kg_ha", "check"]].head(15).to_string(index=False))

    rel = {}
    print("\nDistrict-level reliability per crop (sums vs national total, mismatch rate):")
    for crop in CROPS:
        d = dist[dist.crop == crop]
        n = nat[nat.crop == crop].iloc[0]
        da = abs(d.area_ha.sum() - n.area_ha) / n.area_ha
        dp = abs(d.prod_t.sum() - n.prod_t) / n.prod_t
        bad_rate = d.check.isin(["yield_mismatch", "prod_without_area", "missing"]).mean()
        if da <= 0.01 and dp <= 0.01 and bad_rate <= 0.05:
            rel[crop] = "reliable"
        elif da <= 0.10 and dp <= 0.10 and bad_rate <= 0.10:
            rel[crop] = "caution"
        else:
            rel[crop] = "unreliable"
        print(f"  {crop:10s} {rel[crop]:11s} area gap {da:6.1%} | production gap {dp:7.1%} | bad rows {bad_rate:5.1%}")
    wide["district_reliability"] = wide.apply(lambda r: "national" if r.district == "NEPAL" else rel[r.crop], axis=1)

    out.mkdir(parents=True, exist_ok=True)
    long.to_csv(out / "nepal_crops_2014_15_long.csv", index=False, encoding="utf-8")
    wide.to_csv(out / "nepal_crops_2014_15_wide.csv", index=False, encoding="utf-8")
    print(f"\nwrote {out/'nepal_crops_2014_15_long.csv'} ({len(long)} rows) and {out/'nepal_crops_2014_15_wide.csv'} ({len(wide)} rows)")


if __name__ == "__main__":
    main()
