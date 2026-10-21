"""Download state / province boundaries (geoBoundaries ADM1) for India and Nepal into a new folder.
Run from the repo root on your machine:  uv run python -I etl/sdg/fetch_adm1.py
Or use a file you already have:           uv run python -I etl/sdg/fetch_adm1.py IND path/to/adm1.geojson
Writes data/processed/sdg/context/adm1_IND.geojson and adm1_NPL.geojson (nothing else is touched). Prints the names it found so you can check them."""
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(__file__).resolve().parents[2] / "data/processed/sdg/context"
OUT.mkdir(parents=True, exist_ok=True)


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def keep(iso, raw):
    gj = json.loads(raw)
    feats = [{"type": "Feature", "properties": {"name": f["properties"].get("shapeName") or f["properties"].get("name")}, "geometry": f["geometry"]} for f in gj["features"]]
    (OUT / f"adm1_{iso}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")
    print(iso, len(feats), "areas:", sorted(str(f["properties"]["name"]) for f in feats))


if len(sys.argv) == 3:
    keep(sys.argv[1], Path(sys.argv[2]).read_bytes())
    sys.exit(0)
for iso in ("IND", "NPL"):
    meta = json.loads(get(f"https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM1/"))
    meta = meta[0] if isinstance(meta, list) else meta
    url = meta.get("gjDownloadURL")
    if not url:
        sys.exit(f"STOP: no gjDownloadURL in the answer for {iso}: keys {list(meta)}. Download the ADM1 GeoJSON by hand and pass it: fetch_adm1.py {iso} file.geojson")
    print(iso, "source:", url, "| licence:", meta.get("boundaryLicense"), "| year:", meta.get("boundaryYearRepresented"))
    keep(iso, get(url))
