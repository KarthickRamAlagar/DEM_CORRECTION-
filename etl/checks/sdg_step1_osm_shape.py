import sys, json, glob, collections
sys.stdout.reconfigure(encoding="utf-8")
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/osm/"
files = sorted(glob.glob(base + "osm_*.json"))
d = json.load(open(files[0], encoding="utf-8"))
print("file:", files[0].split("osm/")[-1], "| top-level keys:", list(d.keys()))
print("element types:", collections.Counter(e.get("type") for e in d["elements"]))
w = next(e for e in d["elements"] if (e.get("tags") or {}).get("waterway") == "river")
print("\nfirst river element keys:", list(w.keys()))
print(json.dumps(w)[:500])

lon = []; lat = []; n = 0; no_geom = 0
for p in files:
    for e in json.load(open(p, encoding="utf-8"))["elements"]:
        t = e.get("tags") or {}
        if t.get("waterway") in ("river", "stream", "canal"):
            n += 1
            g = e.get("geometry")
            if not g:
                no_geom += 1
                continue
            for pt in g:
                lon.append(pt["lon"]); lat.append(pt["lat"])
print("\nwaterway elements:", n, "| without inline geometry:", no_geom)
if lon:
    print("waterway coordinate extent: lon", round(min(lon),3), "to", round(max(lon),3), "| lat", round(min(lat),3), "to", round(max(lat),3))
