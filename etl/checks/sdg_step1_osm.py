import sys, json, glob, collections
sys.stdout.reconfigure(encoding="utf-8")
base = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/data/external/osm/"
print("=== SOURCE.json (first 600 chars) ===")
print(open(base + "SOURCE.json", encoding="utf-8").read()[:600])

keys = collections.Counter(); vals = collections.defaultdict(collections.Counter)
n_files = 0; n_el = 0
for p in glob.glob(base + "osm_*.json"):
    n_files += 1
    d = json.load(open(p, encoding="utf-8"))
    for el in d.get("elements", []):
        n_el += 1
        for k, v in (el.get("tags") or {}).items():
            if k in ("amenity", "healthcare", "waterway", "highway", "bridge", "railway", "natural"):
                keys[k] += 1; vals[k][v] += 1
print("\nfiles:", n_files, "| elements:", n_el)
for k in ["waterway", "highway", "bridge", "railway", "natural", "amenity", "healthcare"]:
    print(f"\n{k}: total {keys[k]}  top: {vals[k].most_common(6)}")
