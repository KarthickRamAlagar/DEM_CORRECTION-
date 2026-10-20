"""Download the district crop table (Area, Production, Yield) through the CKAN API.

Source : India Data Portal, from the Directorate of Economics and Statistics,
         Ministry of Agriculture and Farmers Welfare (licence: ODC Attribution).
Output : data/external/crops/apy/apy_district_crops.csv  (+ SOURCE.json)
Run    : uv run python fetch_apy.py
Only reads from the web and writes inside data/external/crops/apy/.
"""
import csv, hashlib, json, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

BASE = "https://ckandev.indiadataportal.com"
RESOURCE = "f980409d-49a2-42ae-9eb0-182365005c04"
PAGE = 10000
OUT = Path("data/external/crops/apy")


def get(offset):
    q = urllib.parse.urlencode({"resource_id": RESOURCE, "limit": PAGE,
                                "offset": offset, "sort": "_id asc"})
    req = urllib.request.Request(BASE + "/api/3/action/datastore_search?" + q,
                                 headers={"User-Agent": "Mozilla/5.0"})
    for k in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                j = json.load(r)
            if j.get("success"):
                return j["result"]
            raise RuntimeError("success=false")
        except Exception as e:
            wait = 5 * (k + 1)
            print(f"  offset {offset}: {e} - retry in {wait}s", flush=True)
            time.sleep(wait)
    sys.exit(f"Giving up at offset {offset}. Run again later.")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    final = OUT / "apy_district_crops.csv"
    part = OUT / "apy_district_crops.csv.part"
    first = get(0)
    total = first["total"]
    cols = [f["id"] for f in first["fields"] if f["id"] != "_id"]
    print(f"rows to fetch: {total}", flush=True)
    n = 0
    with open(part, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        res = first
        offset = 0
        while True:
            recs = res["records"]
            if not recs:
                break
            w.writerows(recs)
            n += len(recs)
            offset += len(recs)
            print(f"  {n}/{total}", flush=True)
            if n >= total:
                break
            res = get(offset)
    if n != total:
        sys.exit(f"Got {n} rows but the portal says {total}. Not saved. Run again.")
    part.replace(final)
    sha = hashlib.sha256(final.read_bytes()).hexdigest()
    (OUT / "SOURCE.json").write_text(json.dumps({
        "dataset": "Crop Wise Area Production Yield (district level)",
        "publisher": "Directorate of Economics and Statistics, Ministry of Agriculture and Farmers Welfare, Government of India",
        "via": BASE + "/dataset/area-production-yield-apy/resource/" + RESOURCE,
        "api": BASE + "/api/3/action/datastore_search",
        "licence": "Open Data Commons Attribution License",
        "retrieved": date.today().isoformat(),
        "rows": n,
        "file": final.name,
        "sha256": sha,
        "note": "year is text like 1997-1998; keep crop_code with crop_name; host name is a dev server, keep this copy",
    }, indent=2), encoding="utf-8")
    print(f"done: {n} rows -> {final}")


if __name__ == "__main__":
    main()