"""
check_phase1.py - read-only check of everything fetched for Pilot A. Changes nothing except writing a report file.

Run from the project root:
    uv run --with duckdb --with rasterio python check_phase1.py

It checks: GFM flood maps (files listed in items.csv versus files on disk), buildings (63 pieces, row counts),
OpenStreetMap (20 pieces, incomplete-answer warnings), district boundaries, and which folders still lack SOURCE.json.
Report is also saved to data/external/CHECK_REPORT.txt
"""
import csv, glob, json, os, random, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path("data/external")
PILOT = (82.0, 25.5, 84.0, 27.0)   # W S E N
out = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)
def head(t): say(""); say("=" * 8, t, "=" * 8)
def human(n):
    for u in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or u == "TB": return f"{n:.1f} {u}"
        n /= 1024

# ---------------------------------------------------------------- 1. GFM
head("1. GFM flood maps")
g = ROOT / "flood_observed" / "gfm"
csv_path = g / "items.csv"
if not csv_path.exists():
    say("items.csv NOT FOUND:", csv_path)
else:
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    say("scenes in items.csv:", len(rows))
    layers = ["flood_extent", "exclusion_mask", "advisory_flags", "reference_water"]
    miss_rows = []
    for L in layers:
        listed = present = 0
        seen = set()
        for r in rows:
            p = r.get(L)
            if not p or p in seen: continue
            seen.add(p); listed += 1
            if (g / p).exists() and (g / p).stat().st_size > 0: present += 1
            else: miss_rows.append({"layer": L, "scene": r["id"], "datetime": r["datetime"], "path": p})
        say(f"  {L:16s} listed {listed:5d}   on disk {present:5d}   missing {listed - present}")
    if miss_rows:
        with open(g / "missing_files.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(miss_rows[0])); w.writeheader(); w.writerows(miss_rows)
        say("  missing files written to", g / "missing_files.csv")
        say("  missing by layer:", dict(Counter(m["layer"] for m in miss_rows)))
        say("  NOTE: a missing advisory_flags file means 'flags unknown', never 'no warning'.")
    parts = glob.glob(str(g / "**" / "*.part"), recursive=True)
    say("  unfinished .part files:", len(parts))
    anomalies = sum(1 for r in rows if r.get("anomaly_detected") == "True")
    say(f"  scenes flagged anomaly_detected: {anomalies} of {len(rows)} ({100*anomalies/max(1,len(rows)):.0f}%)")
    per_year = Counter(r["datetime"][:4] for r in rows)
    say("  scenes per year:", dict(sorted(per_year.items())))
    tot = sum(f.stat().st_size for f in g.rglob("*") if f.is_file())
    say("  total size on disk:", human(tot))
    try:
        import rasterio
        import numpy as np
        ok = [r for r in rows if r.get("flood_extent") and (g / r["flood_extent"]).exists()]
        for r in random.Random(1).sample(ok, min(3, len(ok))):
            with rasterio.open(g / r["flood_extent"]) as s:
                a = s.read(1, out_shape=(500, 500))
                say(f"  opened {Path(r['flood_extent']).name}: {s.width}x{s.height}, {s.crs}, values {sorted(set(np.unique(a).tolist()))}")
    except Exception as e:
        say("  (could not open sample rasters:", str(e)[:80], ")")

# ---------------------------------------------------------------- 2. Buildings
head("2. Buildings (VIDA)")
b = ROOT / "buildings" / "vida"
files = sorted(b.glob("buildings_*.parquet"))
say("pieces on disk:", len(files), "(expected 63)")
say("unfinished .part files:", len(list(b.glob("*.part"))))
if files:
    try:
        import duckdb
        con = duckdb.connect()
        tot = 0; small = []
        for f in files:
            n = con.execute(f"SELECT count(*) FROM read_parquet('{f.as_posix()}')").fetchone()[0]
            tot += n
            if n < 50000: small.append((f.name, n))
        say(f"total buildings: {tot:,}")
        say("pieces with fewer than 50,000 buildings:", small if small else "none")
        xs = con.execute(f"SELECT min(xmin), min(ymin), max(xmax), max(ymax), 0 FROM read_parquet('{(b/'buildings_*.parquet').as_posix()}')").fetchone()
        say(f"extent of footprints: W {xs[0]:.3f} S {xs[1]:.3f} E {xs[2]:.3f} N {xs[3]:.3f}")
    except Exception as e:
        say("could not read parquet:", str(e)[:100])
    say("total size on disk:", human(sum(f.stat().st_size for f in files)))

# ---------------------------------------------------------------- 3. OSM
head("3. OpenStreetMap")
o = ROOT / "osm"
js = sorted(o.glob("osm_*.json"))
say("pieces on disk:", len(js), "(expected 20)")
kinds = Counter(); bad = []
for f in js:
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        bad.append((f.name, "unreadable")); continue
    if d.get("remark"): bad.append((f.name, d["remark"][:90]))
    for e in d.get("elements", []):
        t = e.get("tags", {})
        k = "road" if "highway" in t and "bridge" not in t else "bridge" if "bridge" in t else "waterway" if "waterway" in t else t.get("amenity", "other")
        kinds[k] += 1
say("features by kind:", dict(kinds.most_common()))
say("total features:", f"{sum(kinds.values()):,}")
say("pieces with an incomplete-answer warning or unreadable:", bad if bad else "none")
if bad: say("  -> delete those piece files and run the osm command again")

# ---------------------------------------------------------------- 4. Boundaries
head("4. District boundaries")
def bbox_of(coords, acc):
    if isinstance(coords[0], (int, float)):
        acc[0] = min(acc[0], coords[0]); acc[1] = min(acc[1], coords[1]); acc[2] = max(acc[2], coords[0]); acc[3] = max(acc[3], coords[1])
    else:
        for c in coords: bbox_of(c, acc)
for iso in ("IND", "NPL"):
    p = ROOT / "boundaries" / "geoboundaries" / f"geoBoundaries-{iso}-ADM2.geojson"
    if not p.exists(): say(iso, "file missing"); continue
    d = json.load(open(p, encoding="utf-8"))
    feats = d["features"]; inside = []
    for ft in feats:
        acc = [999, 999, -999, -999]; bbox_of(ft["geometry"]["coordinates"], acc)
        if acc[0] < PILOT[2] and acc[2] > PILOT[0] and acc[1] < PILOT[3] and acc[3] > PILOT[1]:
            inside.append(ft["properties"].get("shapeName"))
    say(f"{iso}: {len(feats)} districts; touching the Pilot A box: {len(inside)}")
    if iso == "IND": say("   ", ", ".join(sorted(x for x in inside if x))[:600])

# ---------------------------------------------------------------- 5. SOURCE.json
head("5. Source records (SOURCE.json)")
folders = sorted({p.parent for p in ROOT.rglob("*") if p.is_file() and p.suffix in (".tif", ".json", ".parquet", ".geojson", ".csv") and p.name != "SOURCE.json"})
tops = sorted({ROOT / x.relative_to(ROOT).parts[0] / x.relative_to(ROOT).parts[1] for x in folders if len(x.relative_to(ROOT).parts) >= 2})
for t in tops:
    say(f"  {'OK     ' if (t / 'SOURCE.json').exists() else 'MISSING'} {t.as_posix()}")

(ROOT / "CHECK_REPORT.txt").write_text("\n".join(out), encoding="utf-8")
say(""); say("report saved:", (ROOT / "CHECK_REPORT.txt").as_posix())
