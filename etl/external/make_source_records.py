"""
make_source_records.py - writes SOURCE.json for the two manual downloads (WorldPop, WorldCover)
and builds data/external/MANIFEST.json that lists every dataset folder. Changes no data file.

Run from the project root:
    uv run python make_source_records.py
"""
import datetime as dt, hashlib, json
from pathlib import Path

ROOT = Path("data/external")

def sha256(p, chunk=1 << 22):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b: break
            h.update(b)
    return h.hexdigest()

RECORDS = [
    (ROOT / "population" / "worldpop", "ind_ppp_2020_constrained.tif", {
        "source": "WorldPop, Global 2000-2020 Constrained, 2020, India, 100 m, BSGM",
        "url": "https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/IND/ind_ppp_2020_constrained.tif",
        "version": "2020 constrained (modelled people per cell)", "licence": "CC BY 4.0",
        "note": "Modelled estimate, not a census count."}),
    (ROOT / "landcover" / "worldcover", "ESA_WorldCover_10m_2021_v200_N24E081_Map.tif", {
        "source": "ESA WorldCover 2021 v200, 10 m, tile N24E081 (24-27 N, 81-84 E)",
        "url": "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N24E081_Map.tif",
        "version": "v200, 2021", "licence": "CC BY 4.0",
        "note": "Land cover classes only: no crop type, season or yield."}),
]
for folder, name, info in RECORDS:
    f = folder / name
    if not f.exists():
        print("MISSING file, skipped:", f); continue
    rec = dict(info)
    rec.update({"files": [{"name": name, "bytes": f.stat().st_size, "sha256": sha256(f)}],
                "downloaded_on": dt.date.fromtimestamp(f.stat().st_mtime).isoformat(),
                "recorded_on": dt.date.today().isoformat()})
    try:
        import rasterio
        with rasterio.open(f) as s:
            rec["crs"] = str(s.crs); rec["size_px"] = [s.width, s.height]; rec["bounds"] = list(s.bounds)
    except Exception:
        pass
    (folder / "SOURCE.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")
    print("wrote", folder / "SOURCE.json")

# manifest
items = []
for sj in sorted(ROOT.rglob("SOURCE.json")):
    d = json.loads(sj.read_text(encoding="utf-8"))
    folder = sj.parent
    nfiles = sum(1 for p in folder.rglob("*") if p.is_file() and p.name != "SOURCE.json")
    size = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
    items.append({"folder": folder.as_posix(), "source": d.get("source"), "licence": d.get("licence"),
                  "downloaded_on": d.get("downloaded_on"), "files": nfiles, "bytes": size})
(ROOT / "MANIFEST.json").write_text(json.dumps({"built_on": dt.date.today().isoformat(), "datasets": items}, indent=2), encoding="utf-8")
print("wrote", ROOT / "MANIFEST.json", "with", len(items), "datasets")
