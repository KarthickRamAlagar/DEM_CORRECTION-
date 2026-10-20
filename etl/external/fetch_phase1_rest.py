"""
fetch_phase1_rest.py - Phase 1 layers that are NOT the flood maps, for Pilot A.

  boundaries : district boundaries (geoBoundaries, India + Nepal, ADM2)        small, seconds
  buildings  : VIDA merged Google + Microsoft building footprints, clipped to the box
               (reads only the needed part of a 64 GB remote file, 0.25-degree pieces, restartable)
  osm        : OpenStreetMap roads, schools, hospitals, waterways through Overpass (0.5-degree pieces, restartable)

Run from the project root, one at a time:
    uv run python fetch_phase1_rest.py boundaries
    uv run --with duckdb python fetch_phase1_rest.py buildings
    uv run python fetch_phase1_rest.py osm
Add --dry-run to see what would happen. Finished pieces are skipped, so you can stop and run again.
Each folder gets a SOURCE.json (where the data came from, date, licence).
"""
import argparse, datetime as dt, json, sys, time, urllib.request, urllib.parse
from pathlib import Path

BBOX = [81.9, 25.4, 84.1, 27.1]   # W S E N  (Pilot A plus margin)
TODAY = dt.date.today().isoformat()


def get(url, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "dem-correction-research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def write_source(folder, info):
    folder.mkdir(parents=True, exist_ok=True)
    info["downloaded_on"] = TODAY
    f = folder / "SOURCE.json"
    if f.exists() and "bbox_wsen" in info:          # a later run with a new box must not hide the earlier box
        try:
            old = json.load(open(f))["bbox_wsen"]
            b = info["bbox_wsen"]
            info["bbox_wsen"] = [min(old[0], b[0]), min(old[1], b[1]), max(old[2], b[2]), max(old[3], b[3])]
            info["note_boxes"] = "bbox_wsen is the union of all boxes fetched so far"
        except Exception:
            pass
    json.dump(info, open(f, "w"), indent=2)


def frange(a, b, step):
    x = a
    while x < b - 1e-9:
        yield round(x, 6), round(min(x + step, b), 6)
        x += step


# ---------------------------------------------------------------- boundaries
def boundaries(a):
    out = Path("data/external/boundaries/geoboundaries")
    for iso in ("IND", "NPL"):
        meta = json.loads(get(f"https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM2/"))
        dest = out / f"geoBoundaries-{iso}-ADM2.geojson"
        print(iso, meta.get("boundaryName"), "units:", meta.get("admUnitCount"), "licence:", meta.get("boundaryLicense"))
        if a.dry_run:
            continue
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            url = meta["gjDownloadURL"]
            alt = url.replace("https://github.com/wmgeolab/geoBoundaries/raw/", "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/")
            for u in (url, alt):          # second address is a backup route to the same file
                try:
                    dest.write_bytes(get(u, timeout=300))
                    break
                except Exception as e:
                    print("  could not use", u[:60], str(e)[:60])
        print("  saved", dest, dest.stat().st_size // 1024, "KB")
        write_source(out, {"source": "geoBoundaries gbOpen ADM2", "api": "https://www.geoboundaries.org/api/current/gbOpen/",
                           "licence": meta.get("boundaryLicense"), "note": "check the licence of each country before publishing"})


# ---------------------------------------------------------------- buildings
VIDA_TPL = "https://data.source.coop/vida/google-microsoft-open-buildings/geoparquet/by_country/country_iso={c}/{c}.parquet"


def buildings(a):
    import duckdb
    VIDA = VIDA_TPL.format(c=a.country)
    out = Path("data/external/buildings/vida" + ("" if a.country == "IND" else "_" + a.country.lower()))
    W, S, E, N = a.bbox
    pieces = [(x0, x1, y0, y1) for (y0, y1) in frange(S, N, 0.25) for (x0, x1) in frange(W, E, 0.25)]
    print(f"{len(pieces)} pieces of 0.25 x 0.25 degrees")
    if a.dry_run:
        return
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    total = 0
    for i, (x0, x1, y0, y1) in enumerate(pieces, 1):
        dest = out / f"buildings_{x0:.2f}_{y0:.2f}.parquet"
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".part")
        # a building belongs to the piece that contains its lower-left corner, so no building is counted twice
        q = f"""COPY (SELECT boundary_id, bf_source, confidence, area_in_meters, bbox.xmin AS xmin, bbox.ymin AS ymin,
                       bbox.xmax AS xmax, bbox.ymax AS ymax, ST_AsWKB(geometry) AS geometry_wkb
                FROM read_parquet('{VIDA}')
                WHERE bbox.xmin >= {x0} AND bbox.xmin < {x1} AND bbox.ymin >= {y0} AND bbox.ymin < {y1})
                TO '{tmp.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"""
        for k in range(3):
            try:
                con.execute(q)
                break
            except Exception as e:
                print("  retry", k + 1, str(e)[:100], flush=True)
                time.sleep(5)
        else:
            print(f"  piece {i} FAILED, run again later", flush=True)
            continue
        tmp.replace(dest)
        n = con.execute(f"SELECT count(*) FROM read_parquet('{dest.as_posix()}')").fetchone()[0]
        total += n
        print(f"piece {i}/{len(pieces)} ({x0},{y0}): {n:,} buildings", flush=True)
    print("new buildings this run:", f"{total:,}")
    write_source(out, {"source": "VIDA merged Google V3 Open Buildings + Microsoft footprints (Source Cooperative)", "url": VIDA,
                       "bbox_wsen": a.bbox, "licence": "ODbL (check bf_source for Google/Microsoft terms)",
                       "note": "Footprints only: no damage, no height. Geometry stored as WKB in geometry_wkb."})


# ---------------------------------------------------------------- osm
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def osm_query(s, w, n, e):
    b = f"({s},{w},{n},{e})"
    return f"""[out:json][timeout:180];
(
 way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]{b};
 way["waterway"~"^(river|canal|stream)$"]{b};
 way["bridge"="yes"]["highway"]{b};
 node["amenity"~"^(hospital|clinic|school|college|university|shelter)$"]{b};
 way["amenity"~"^(hospital|clinic|school|college|university|shelter)$"]{b};
);
out geom tags;"""


def osm(a):
    out = Path("data/external/osm")
    W, S, E, N = a.bbox
    pieces = [(x0, x1, y0, y1) for (y0, y1) in frange(S, N, 0.5) for (x0, x1) in frange(W, E, 0.5)]
    print(f"{len(pieces)} pieces of 0.5 x 0.5 degrees")
    if a.dry_run:
        return
    for i, (x0, x1, y0, y1) in enumerate(pieces, 1):
        dest = out / f"osm_{x0:.2f}_{y0:.2f}.json"
        if dest.exists():
            continue
        body = urllib.parse.urlencode({"data": osm_query(y0, x0, y1, x1)}).encode()
        ok = False
        for k in range(6):
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                raw = get(OVERPASS[k % len(OVERPASS)], data=body, timeout=240)
                n = len(json.loads(raw)["elements"])
                dest.write_bytes(raw)
                print(f"piece {i}/{len(pieces)} ({x0},{y0}): {n:,} features", flush=True)
                ok = True
                break
            except Exception as e:
                print("  retry", k + 1, str(e)[:100], flush=True)
                time.sleep(15 * (k + 1))
        if not ok:
            print(f"  piece {i} FAILED, run again later", flush=True)
        time.sleep(2)   # be polite to the free server
    write_source(out, {"source": "OpenStreetMap contributors via Overpass API", "bbox_wsen": a.bbox,
                       "licence": "ODbL: credit 'OpenStreetMap contributors'",
                       "tags": "highway (motorway..tertiary), waterway (river, canal, stream), bridge, amenity (hospital, clinic, school, college, university, shelter)"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["boundaries", "buildings", "osm"])
    ap.add_argument("--bbox", nargs=4, type=float, default=BBOX, metavar=("W", "S", "E", "N"))
    ap.add_argument("--country", default="IND", choices=["IND", "NPL"], help="buildings only: which country file to read")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    {"boundaries": boundaries, "buildings": buildings, "osm": osm}[a.what](a)


if __name__ == "__main__":
    sys.exit(main())
