"""GloFAS river forecast to chances of high flow (patch 13, step 3). Reads the downloaded forecast files and the flood levels; writes one small file the API serves.
Run from the repo root (after fetch_glofas.py --forecast and build_glofas_features.py):  uv run python -I -u etl/forecast/build_glofas_forecast.py [--date YYYY-MM-DD]
Reads   data/external/glofas/forecast/glofas_fc_<YYYYMMDD>_control.nc and _ens.nc   (control + 50 perturbed members = 51 members, 30 days)
        data/processed/sdg/forecast/glofas_levels.npz
Writes  data/processed/sdg/forecast/glofas_forecast_latest.npz  and  glofas_forecast_meta.json
For every river cell and every lead day: the 10th / 50th / 90th percentile flow of the 51 members, and the share of members at or above RL2, RL5 and RL20.
Also for every cell: the share of members whose highest flow in the 30 days reaches each level (pmax).
Date rule: the date shown is the day the 24-hour window ends (UTC). lead 1 = the day after the issue date."""
import argparse, json, re, sys
from pathlib import Path
import numpy as np, pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glofas_io as G

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; FC = ROOT / "data" / "external" / "glofas" / "forecast"; OUT = ROOT / "data" / "processed" / "sdg" / "forecast"

def align(lat, lon, lat0, lon0):
    """index maps from the forecast grid onto the levels grid (same 0.05 degree grid; the box edge can differ by a cell)"""
    def m(a, b):
        idx = np.abs(a[:, None] - b[None, :]).argmin(axis=1); ok = np.abs(a - b[idx]) < 0.026; return idx, ok
    return m(lat, lat0), m(lon, lon0)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--date"); a = ap.parse_args()
    lv = OUT / "glofas_levels.npz"
    if not lv.exists(): sys.exit("STOP: glofas_levels.npz not found. Run build_glofas_features.py first.")
    L = np.load(lv)
    issues = sorted({re.search(r"glofas_fc_(\d{8})_", p.name)[1] for p in FC.glob("glofas_fc_*_control.nc") if (FC / p.name.replace("_control", "_ens")).exists()})
    if not issues: sys.exit("STOP: no complete forecast (control + ens files) in data/external/glofas/forecast. Run: uv run python -I -u etl/forecast/fetch_glofas.py --forecast")
    day = a.date.replace("-", "") if a.date else issues[-1]
    if day not in issues: sys.exit(f"STOP: no complete forecast for {day}. Available: {issues}")
    issue = pd.Timestamp(f"{day[:4]}-{day[4:6]}-{day[6:]}")
    lead_c, lat, lon, ctrl = G.read_forecast(FC / f"glofas_fc_{day}_control.nc", issue)
    lead_e, lat_e, lon_e, ens = G.read_forecast(FC / f"glofas_fc_{day}_ens.nc", issue)
    if not (np.array_equal(lead_c, lead_e) and np.allclose(lat, lat_e) and np.allclose(lon, lon_e)): sys.exit("STOP: the control and ensemble files do not share the same lead times or grid.")
    mem = np.concatenate([ctrl, ens], axis=0); n = mem.shape[0]
    if n < 20: sys.exit(f"STOP: only {n} members; the ensemble file looks incomplete.")
    order = np.argsort(lead_c); leads = lead_c[order]; mem = mem[:, order]
    (ii, iok), (jj, jok) = align(lat, lon, L["lat"], L["lon"])
    ny, nx = len(lat), len(lon); rl = {k: np.full((ny, nx), np.nan, "float32") for k in ("rl2", "rl5", "rl20")}; meanq = np.full((ny, nx), np.nan, "float32"); river = np.zeros((ny, nx), bool)
    ok2 = iok[:, None] & jok[None, :]
    for k in rl: rl[k] = np.where(ok2, L[k][np.ix_(ii, jj)], np.nan).astype("float32")
    meanq = np.where(ok2, L["mean"][np.ix_(ii, jj)], np.nan).astype("float32"); river = ok2 & L["river"][np.ix_(ii, jj)]
    print(f"Issue {issue:%a %d %b %Y}; members {n}; leads {leads.min()}-{leads.max()} days; grid {ny} x {nx}; river cells matched {int(river.sum())}")
    q = np.nanpercentile(mem, [10, 50, 90], axis=0).astype("float32")          # [3, lead, y, x]
    out = {"lat": lat, "lon": lon, "lead_days": leads, "q10": q[0], "q50": q[1], "q90": q[2], "river": river, "mean": meanq}
    for k in rl:
        out[f"p_{k}"] = (np.nanmean(mem >= rl[k][None, None], axis=0)).astype("float32")       # share of members at/above the level, per lead
        out[f"pmax_{k}"] = (np.nanmean(np.nanmax(mem, axis=1) >= rl[k][None], axis=0)).astype("float32")   # share of members reaching it at any time
        out[k] = rl[k]
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "glofas_forecast_latest.npz", **out)
    (OUT / "glofas_forecast_meta.json").write_text(json.dumps({"issue_date": issue.strftime("%Y-%m-%d"), "issue_weekday": issue.strftime("%A"), "members": int(n), "lead_days": [int(leads.min()), int(leads.max())], "built_utc": pd.Timestamp.now("UTC").isoformat(timespec="seconds"),
        "date_rule": "The date shown is the day the 24-hour flow window ends (UTC). Lead 1 is the day after the issue date.", "source": "GloFAS operational forecast (LISFLOOD), Copernicus Emergency Management Service"}, indent=1), encoding="utf-8")
    print("Wrote glofas_forecast_latest.npz and glofas_forecast_meta.json")

if __name__ == "__main__":
    main()
