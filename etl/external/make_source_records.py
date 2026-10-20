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
    (ROOT / "population" / "worldpop", "ind_pop_2020_CN_100m_R2024B_v1.tif", {
        "source": "WorldPop 2020 constrained (CN) 100 m, release R2024B v1, India and Nepal rasters (product taken from the file names)",
        "url": "not recorded (files were downloaded by hand; original link not kept)",
        "version": "R2024B v1, 2020, constrained", "licence": "CC BY 4.0 (WorldPop standard licence, not checked for this release)",
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

# add any other .tif in these folders (Nepal WorldPop raster, second WorldCover tile) to the record
for folder, name, info in RECORDS:
    sj = folder / "SOURCE.json"
    if sj.exists():
        rec = json.loads(sj.read_text(encoding="utf-8"))
        if isinstance(rec, dict):
            known = {x["name"] for x in rec.get("files", [])}
            for extra in sorted(folder.glob("*.tif")):
                if extra.name not in known:
                    rec["files"].append({"name": extra.name, "bytes": extra.stat().st_size, "sha256": sha256(extra)})
            sj.write_text(json.dumps(rec, indent=2), encoding="utf-8")
            print("updated file list in", sj)

# manifest
items = []
for sj in sorted(ROOT.rglob("SOURCE.json")):
    d = json.loads(sj.read_text(encoding="utf-8"))
    if isinstance(d, list):
        d = {"source": "; ".join(sorted({str(e.get("title") or e.get("note") or e.get("file")) for e in d})),
             "licence": "; ".join(sorted({str(e.get("licence")) for e in d})),
             "downloaded_on": max((str(e.get("downloaded") or "") for e in d), default=None)}
    folder = sj.parent
    nfiles = sum(1 for p in folder.rglob("*") if p.is_file() and p.name != "SOURCE.json")
    size = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
    items.append({"folder": folder.as_posix(), "source": d.get("source"), "licence": d.get("licence"),
                  "downloaded_on": d.get("downloaded_on"), "files": nfiles, "bytes": size})
(ROOT / "MANIFEST.json").write_text(json.dumps({"built_on": dt.date.today().isoformat(), "datasets": items}, indent=2), encoding="utf-8")
print("wrote", ROOT / "MANIFEST.json", "with", len(items), "datasets")
