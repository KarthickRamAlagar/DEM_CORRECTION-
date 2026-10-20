"""Download the NIN Health Facilities directory (with geo code) from data.gov.in.

Needs your own free API key in the environment variable DATA_GOV_IN_KEY
(the public sample key returns only 10 records). The key is never written to disk.
Output : data/external/health_facilities/nin_health_facilities.csv (+ SOURCE.json)
Run    : uv run python fetch_health.py
"""
import csv, hashlib, json, os, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

RESOURCE = "0dfebd78-bac4-44be-9291-025a983323f4"
URL = "https://api.data.gov.in/resource/" + RESOURCE
PAGE = 1000
OUT = Path("data/external/health_facilities")


def get(key, offset):
    q = urllib.parse.urlencode({"api-key": key, "format": "json",
                                "offset": offset, "limit": PAGE})
    req = urllib.request.Request(URL + "?" + q, headers={"User-Agent": "Mozilla/5.0"})
    for k in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            wait = 5 * (k + 1)
            print(f"  offset {offset}: {type(e).__name__} - retry in {wait}s", flush=True)
            time.sleep(wait)
    sys.exit(f"Giving up at offset {offset}. Run again later.")


def main():
    key = os.environ.get("DATA_GOV_IN_KEY", "").strip()
    if not key:
        sys.exit("Set your key first:  export DATA_GOV_IN_KEY=\"...\"")
    OUT.mkdir(parents=True, exist_ok=True)
    final, part = OUT / "nin_health_facilities.csv", OUT / "nin_health_facilities.csv.part"
    first = get(key, 0)
    total = int(first.get("total", 0))
    recs = first.get("records", [])
    if not recs:
        sys.exit("No records returned: " + str(first)[:300])
    cols = [f["id"] for f in first.get("field", [])] or list(recs[0].keys())
    print(f"portal says {total} rows; first page gave {len(recs)}", flush=True)
    if len(recs) < PAGE and total > len(recs):
        print(f"NOTE: page size is capped at {len(recs)} for this key; this will take longer.")
    n, offset, res = 0, 0, first
    with open(part, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        while True:
            recs = res.get("records", [])
            if not recs:
                break
            w.writerows(recs)
            n += len(recs)
            offset += len(recs)
            if (n // len(recs)) % 10 == 0:
                print(f"  {n}/{total}", flush=True)
            if n >= total:
                break
            res = get(key, offset)
    if n != total:
        sys.exit(f"Got {n} rows but the portal says {total}. Not saved. Run again.")
    part.replace(final)
    (OUT / "SOURCE.json").write_text(json.dumps({
        "dataset": "NIN Health Facilities with Geo Code and additional parameters",
        "publisher": "Government of India (data.gov.in)",
        "via": "https://data.gov.in/resource/nin-health-faclities-geo-code-and-additional-parameters-updated-till-last-month",
        "resource_id": RESOURCE,
        "licence": "GODL-India (attribution required)",
        "retrieved": date.today().isoformat(),
        "rows": n,
        "file": final.name,
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "note": "coverage in Pilot A districts not yet checked",
    }, indent=2), encoding="utf-8")
    print(f"done: {n} rows -> {final}")


if __name__ == "__main__":
    main()