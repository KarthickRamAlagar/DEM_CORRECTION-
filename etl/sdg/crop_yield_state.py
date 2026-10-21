"""Crop yield per state from the India APY table already on disk (read-only on inputs).
Run from the repo root:  uv run python -I etl/sdg/crop_yield_state.py
Writes data/processed/sdg/context/crop_yield_state.json (new file, nothing else is touched).
Yield = total production / total area, summed over districts and seasons, for the latest year that looks complete.
No price is applied: the value at risk stays 'No data' until a verified MSP table is added."""
import json
import sys
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/external/crops/apy"
OUT = ROOT / "data/processed/sdg/context/crop_yield_state.json"
STATES = ["Bihar", "Uttar Pradesh"]
CROPS = ["Rice", "Wheat"]


def pick(cols, *needles):
    for c in cols:
        low = c.lower().replace(" ", "_")
        if all(n in low for n in needles):
            return c
    return None


files = sorted(list(SRC.rglob("*.csv")) + list(SRC.rglob("*.CSV")))
if not files:
    sys.exit(f"STOP: no csv under {SRC}. Nothing written.")
df = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
cols = list(df.columns)
print("files:", len(files), "rows:", len(df)); print("columns:", cols)
cs, cc, cy, ca, cp = pick(cols, "state"), pick(cols, "crop") if pick(cols, "crop") != pick(cols, "crop", "year") else None, pick(cols, "year"), pick(cols, "area"), pick(cols, "production")
# the crop-name column must not be the year column
cc = next((c for c in cols if c.lower().strip() in ("crop", "crop_name")), cc)
if None in (cs, cc, cy, ca, cp):
    sys.exit(f"STOP: could not find state/crop/year/area/production columns: {(cs, cc, cy, ca, cp)}. Nothing written.")
print("using:", dict(state=cs, crop=cc, year=cy, area=ca, production=cp))
df[ca] = pd.to_numeric(df[ca], errors="coerce"); df[cp] = pd.to_numeric(df[cp], errors="coerce")
df["_s"] = df[cs].astype(str).str.strip(); df["_c"] = df[cc].astype(str).str.strip()
rows, audit = [], []
for st in STATES:
    for cr in CROPS:
        sub = df[(df["_s"].str.lower() == st.lower()) & (df["_c"].str.lower() == cr.lower())].dropna(subset=[ca, cp])
        if sub.empty:
            audit.append(f"{st} / {cr}: no rows"); continue
        by = sub.groupby(cy)[[ca, cp]].sum().sort_index()
        by = by[by[ca] > 0]
        yr = by.index[-1]
        if len(by) > 1 and by[ca].iloc[-1] < 0.8 * by[ca].iloc[-2]:
            yr = by.index[-2]; audit.append(f"{st} / {cr}: latest year looked incomplete, used {yr}")
        a, p = float(by.loc[yr, ca]), float(by.loc[yr, cp])
        rows.append({"state": st, "crop": cr, "year": str(yr), "area_ha": round(a), "production_t": round(p), "yield_t_per_ha": round(p / a, 2)})
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"source": "India APY table on disk (data/external/crops/apy)", "units": "area in hectares, production in tonnes (as the file states; not re-checked)",
                           "note": "Summed over districts and seasons. No price applied.", "rows": rows, "audit": audit}, indent=1), encoding="utf-8")
print(json.dumps(rows, indent=1)); print("audit:", audit); print("wrote", OUT)
