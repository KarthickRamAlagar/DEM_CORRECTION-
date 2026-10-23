"""Fetch GloFAS river discharge from the Copernicus Early Warning Data Store (EWDS). Patch 13. Resumable: files already on disk are skipped.
Run from the repo root (names only are ever printed for keys, never values):
  uv run python -I -u etl/forecast/fetch_glofas.py --check                     test the key and the licence with one tiny request
  uv run python -I -u etl/forecast/fetch_glofas.py --history [--years 2005-2025]   daily discharge June-October for the study box (flood thresholds, river features)
  uv run python -I -u etl/forecast/fetch_glofas.py --forecast [--date YYYY-MM-DD]  the 30-day forecast (control + 50 ensemble members); default: latest issue date available
  uv run python -I -u etl/forecast/fetch_glofas.py --inspect <file.nc>             print what is inside a downloaded file
Key: the script reads CDSAPI_KEY (and CDSAPI_URL) from the repo .env, or ~/.cdsapirc. GloFAS now lives on https://ewds.climate.copernicus.eu/api;
the same Copernicus account works, but the GloFAS licence must be accepted once on the dataset page (the --check message says where).
Writes data/external/glofas/{historical,forecast}/*.nc and data/external/glofas/SOURCE.json."""
import argparse, json, os, re, sys, time
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; DIR = ROOT / "data" / "external" / "glofas"
AREA = [28.1, 81.9, 25.4, 84.1]          # north, west, south, east: the study box (same as the CHIRPS and GFM fetch)
EWDS = "https://ewds.climate.copernicus.eu/api"
KEY_NAMES = ["CDSAPI_KEY", "CDS_API_KEY", "COPERNICUS_CDS_KEY", "COPERNICUS_API_KEY", "EWDS_API_KEY", "GLOFAS_API_KEY", "CDS_KEY"]
URL_NAMES = ["CDSAPI_URL", "CDS_API_URL", "EWDS_URL"]

def read_env():
    out = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
            k, v = line.split("=", 1); out[k.strip()] = v.strip().strip('"').strip("'")
    return out

def credentials():
    env = read_env(); key = next((env[n] for n in KEY_NAMES if env.get(n)), None) or next((os.environ[n] for n in KEY_NAMES if os.environ.get(n)), None)
    found_name = next((n for n in KEY_NAMES if env.get(n) or os.environ.get(n)), None)
    if not key:
        rc = Path.home() / ".cdsapirc"
        if rc.exists():
            for line in rc.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.lower().startswith("key:"): key = line.split(":", 1)[1].strip(); found_name = "~/.cdsapirc (key)"
    if not key:
        like = sorted(k for k in env if re.search(r"CDS|COPERNICUS|GLOFAS|EWDS|ECMWF", k, re.I))
        sys.exit("STOP: no Copernicus key found. Names looked for: " + ", ".join(KEY_NAMES) + ".\nNames in .env that look related (names only): " + (", ".join(like) or "none") + "\nTell me the right name, or add a line CDSAPI_KEY=... to .env.")
    url = next((env[n] for n in URL_NAMES if env.get(n)), None) or EWDS
    if "ewds" not in url:        # a key for the old CDS address works on the same account, but GloFAS is served from EWDS
        url = EWDS
    print(f"Using key from: {found_name}  |  server: {url}")
    return url, key

def client():
    try: import cdsapi
    except ImportError: sys.exit("STOP: cdsapi is not installed. Run: uv add cdsapi xarray netcdf4")
    url, key = credentials(); return cdsapi.Client(url=url, key=key, quiet=True, progress=False)

def retrieve(c, dataset, req, target, tries=3):
    target = Path(target)
    if target.exists() and target.stat().st_size > 0: print("  have", target.name); return True
    target.parent.mkdir(parents=True, exist_ok=True); tmp = target.with_suffix(".part")
    for i in range(1, tries + 1):
        try:
            t0 = time.time(); c.retrieve(dataset, req, str(tmp)); tmp.replace(target)
            print(f"  got  {target.name}  ({target.stat().st_size/1e6:.1f} MB, {time.time()-t0:.0f} s)"); return True
        except Exception as e:
            msg = str(e).replace("\n", " ")[:400]; print(f"  try {i}/{tries} failed for {target.name}: {msg}")
            if "401" in msg or "Unauthorized" in msg: print("  -> The key was rejected. Copy the key again from your profile page on https://ewds.climate.copernicus.eu (the key only, like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). If it has a number and a colon in front, remove them."); return False
            if re.search(r"licen[cs]e", msg, re.I): print("  -> Accept the GloFAS licence once: open https://ewds.climate.copernicus.eu/datasets/cems-glofas-forecast?tab=download , scroll to 'Terms of use', accept, then run again."); return False
            time.sleep(10 * i)
    return False

def hist_request(year):
    kind = "consolidated" if year <= 2024 else "intermediate"      # 2025 onward is not consolidated yet (checked in the dataset constraints)
    return {"system_version": ["version_4_0"], "hydrological_model": ["lisflood"], "product_type": [kind], "variable": ["average_river_discharge_in_the_last_24_hours"], "timespan": ["time_mean"],
            "year": [str(year)], "month": ["06", "07", "08", "09", "10"], "day": [f"{d:02d}" for d in range(1, 32)], "data_format": "netcdf", "download_format": "unarchived", "area": AREA}

def fc_request(issue, member_type):
    return {"system_version": ["operational"], "hydrological_model": ["lisflood"], "product_type": [member_type], "variable": ["river_discharge_in_the_last_24_hours"],
            "year": [f"{issue.year}"], "month": [f"{issue.month:02d}"], "day": [f"{issue.day:02d}"], "leadtime_hour": [str(h) for h in range(24, 721, 24)], "data_format": "netcdf", "download_format": "unarchived", "area": AREA}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--check", action="store_true"); ap.add_argument("--history", action="store_true"); ap.add_argument("--forecast", action="store_true")
    ap.add_argument("--years", default="2005-2025"); ap.add_argument("--date"); ap.add_argument("--inspect"); a = ap.parse_args()
    if a.inspect: return inspect(a.inspect)
    if not (a.check or a.history or a.forecast): ap.print_help(); return
    c = client(); (DIR / "historical").mkdir(parents=True, exist_ok=True); (DIR / "forecast").mkdir(parents=True, exist_ok=True)
    if a.check:
        ok = retrieve(c, "cems-glofas-forecast", {**fc_request(date.today() - timedelta(days=3), "control_forecast"), "leadtime_hour": ["24"], "area": [27.1, 83.0, 26.9, 83.2]}, DIR / "forecast" / "_check.nc", tries=1)
        print("\nCHECK PASSED: the key and licence work." if ok else "\nCHECK FAILED: see the message above.")
        try: (DIR / "forecast" / "_check.nc").unlink()
        except OSError: pass
        return
    if a.history:
        y0, y1 = [int(x) for x in a.years.split("-")]; print(f"History {y0}-{y1}: one file per year (June-October). Each waits in the Copernicus queue; this can take a while. Safe to stop and run again.")
        bad = [y for y in range(y0, y1 + 1) if not retrieve(c, "cems-glofas-historical", hist_request(y), DIR / "historical" / f"glofas_hist_{y}.nc")]
        print("Failed years:", bad or "none")
    if a.forecast:
        days = [date.fromisoformat(a.date)] if a.date else [date.today() - timedelta(days=k) for k in (0, 1, 2, 3)]
        done = False
        for d in days:
            print(f"Forecast issued {d.isoformat()}:")
            ok1 = retrieve(c, "cems-glofas-forecast", fc_request(d, "control_forecast"), DIR / "forecast" / f"glofas_fc_{d:%Y%m%d}_control.nc", tries=1)
            if not ok1: continue
            ok2 = retrieve(c, "cems-glofas-forecast", fc_request(d, "ensemble_perturbed_forecasts"), DIR / "forecast" / f"glofas_fc_{d:%Y%m%d}_ens.nc")
            if ok2: done = True; break
        print("Forecast fetched." if done else "Forecast not fetched. Try --date with an earlier issue date.")
    (DIR / "SOURCE.json").write_text(json.dumps({"source": "Copernicus Emergency Management Service, GloFAS, via the Early Warning Data Store (EWDS)", "datasets": ["cems-glofas-historical (version_4_0, lisflood, consolidated/intermediate)", "cems-glofas-forecast (operational, lisflood)"],
                                                 "area_north_west_south_east": AREA, "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "licence": "Copernicus licence for GloFAS data, accepted on the dataset page", "note": "No key is stored in this file."}, indent=1), encoding="utf-8")

def inspect(path):
    import xarray as xr
    try: ds = xr.open_dataset(path)
    except ValueError: ds = xr.open_dataset(path, decode_timedelta=False)
    print(ds)
    for v in ds.data_vars: print("variable:", v, ds[v].dims, ds[v].shape, "min/max:", float(ds[v].min()), float(ds[v].max()))

if __name__ == "__main__":
    main()
