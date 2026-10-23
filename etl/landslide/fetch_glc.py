"""Patch 15, step 2: download the NASA Global Landslide Catalog export (a landslide inventory, 2007-2016 snapshot) to data/external/landslides/glc/.
  uv run python -I etl/landslide/fetch_glc.py
Source page checked 22 Oct 2026: https://catalog.data.gov/dataset/global-landslide-catalog-export  (one-time export of the NASA GLC; the page names no licence and says
using the data means agreeing to NASA's Terms and Conditions: read them before publishing results). Writes the CSV and SOURCE.json. Nothing else is changed."""
import hashlib, json, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; DIR = ROOT / "data" / "external" / "landslides" / "glc"
URL = "https://data.nasa.gov/docs/legacy/Global_Landslide_Catalog_Export/Global_Landslide_Catalog_Export_rows.csv"
DIR.mkdir(parents=True, exist_ok=True); dst = DIR / "Global_Landslide_Catalog_Export_rows.csv"
try:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (research download)"})
    with urllib.request.urlopen(req, timeout=120) as r: data = r.read()
except Exception as e: sys.exit(f"STOP: download failed ({type(e).__name__}: {e}). Open {URL} in a browser, save it as {dst} and run validate_glc.py.")
head = data[:600].decode("utf-8", "replace").lower()
if "latitude" not in head or "longitude" not in head: sys.exit(f"STOP: the file does not look like the catalog (no latitude/longitude in the header). First bytes: {head[:200]!r}")
dst.write_bytes(data); rows = data.count(b"\n") - 1
(DIR / "SOURCE.json").write_text(json.dumps({"name": "NASA Global Landslide Catalog (export)", "url": URL, "page": "https://catalog.data.gov/dataset/global-landslide-catalog-export", "fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "sha256": hashlib.sha256(data).hexdigest(), "approx_rows": rows, "note": "One-time export; the catalog page says it is current as of 7 Mar 2016. Terms and Conditions not shown on the page: check before publishing. Event locations have stated accuracy (field location_accuracy)."}, indent=1), encoding="utf-8")
print(f"saved {dst} ({len(data)/1e6:.1f} MB, about {rows} rows) and SOURCE.json")
