"""Patch 15b: download landslide event points for the DEM box from NASA's COOLR service (the Global Landslide Catalog plus Landslide Reporter events) to
data/external/landslides/coolr/coolr_events_points.csv. Replaces fetch_glc.py (the old export link is dead).
  uv run python -I etl/landslide/fetch_coolr.py
Service (found 22 Oct 2026): https://gis.earthdata.nasa.gov/gis05/rest/services/Landslides/COOLR_Events_Points/FeatureServer   (ArcGIS REST, query returns at most 2000 per call; this script pages).
Field names were not documented on the pages I could read, so the script keeps every attribute, adds latitude, longitude and an event_date column from any date-like field, and prints what it found.
Citations asked by NASA: GLC events: Kirschbaum et al. 2015 Geomorphology 249:4-15 and 2010 Natural Hazards 52:561-575. Landslide Reporter events: Juang, Stanley and Kirschbaum 2019 PLOS ONE 14(7):e0218657. No licence text was shown on the pages: read NASA's terms before publishing.
If the service is unreachable: open the Landslide Viewer (https://gpm.nasa.gov/landslides/data.html -> Download Landslide Catalog), save the CSV, and run validate_glc.py --glc <that file>."""
import csv, hashlib, json, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]; DIR = ROOT / "data" / "external" / "landslides" / "coolr"
BASE = "https://gis.earthdata.nasa.gov/gis05/rest/services/Landslides/COOLR_Events_Points/FeatureServer"
BOX = (80.0, 25.0, 84.0, 28.0)

def get(url, params=None):
    q = ("?" + urllib.parse.urlencode(params)) if params else ""
    req = urllib.request.Request(url + q, headers={"User-Agent": "Mozilla/5.0 (research download)"})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read().decode("utf-8"))

def main():
    try: svc = get(BASE, {"f": "json"})
    except Exception as e: sys.exit(f"STOP: the service did not answer ({type(e).__name__}: {e}). See the note at the top of this file for the manual download.")
    layers = svc.get("layers") or []; print("layers:", [(l.get("id"), l.get("name")) for l in layers])
    if not layers: sys.exit("STOP: the service lists no layers. Use the manual download described at the top of this file.")
    rows, seen_fields, used = [], set(), []
    for l in layers:
        lid = l["id"]
        try: info = get(f"{BASE}/{lid}", {"f": "json"})
        except Exception as e: print("  skip layer", lid, type(e).__name__); continue
        gt = str(info.get("geometryType", ""))
        if "Point" not in gt: print(f"  layer {lid} ({l.get('name')}) is {gt}: skipped"); continue
        n0 = len(rows); off = 0
        while True:
            try: d = get(f"{BASE}/{lid}/query", {"where": "1=1", "geometry": ",".join(map(str, BOX)), "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
                                               "outFields": "*", "returnGeometry": "true", "outSR": 4326, "resultOffset": off, "resultRecordCount": 1000, "f": "json"})
            except Exception as e: print("  query failed:", type(e).__name__, e); break
            if "error" in d: print("  service error:", d["error"]); break
            feats = d.get("features", [])
            for f in feats:
                at = dict(f.get("attributes") or {}); g = f.get("geometry") or {}
                if "x" in g and "y" in g: at["longitude"], at["latitude"] = g["x"], g["y"]
                at["_layer"] = l.get("name"); rows.append(at); seen_fields.update(at.keys())
            off += len(feats)
            if not feats or not d.get("exceededTransferLimit", False) and len(feats) < 1000: break
        print(f"  layer {lid} ({l.get('name')}): {len(rows) - n0} events in the box"); used.append(lid)
    if not rows: sys.exit("STOP: no events came back for the box. Use the manual download described at the top of this file.")
    for r in rows:
        for k in list(r):
            if "date" in k.lower() and isinstance(r[k], (int, float)) and r[k] > 1e11:
                r[k] = datetime.fromtimestamp(r[k] / 1000, timezone.utc).strftime("%Y-%m-%d")
    cols = sorted(seen_fields | {"event_date"}); dc = next((c for c in cols if c != "event_date" and "date" in c.lower()), None)
    for r in rows:
        if "event_date" not in r and dc and r.get(dc): r["event_date"] = r[dc]
    DIR.mkdir(parents=True, exist_ok=True); dst = DIR / "coolr_events_points.csv"
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
    (DIR / "SOURCE.json").write_text(json.dumps({"name": "NASA COOLR events (points)", "service": BASE, "box": BOX, "fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "rows": len(rows), "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
        "fields": cols, "citations": ["Kirschbaum et al. 2015 Geomorphology 249:4-15", "Kirschbaum et al. 2010 Natural Hazards 52:561-575", "Juang, Stanley, Kirschbaum 2019 PLOS ONE 14(7):e0218657"], "note": "No licence text on the pages read; check NASA terms before publishing."}, indent=1), encoding="utf-8")
    print(f"\nsaved {dst}: {len(rows)} events. Fields: {cols[:25]}")

if __name__ == "__main__": main()
