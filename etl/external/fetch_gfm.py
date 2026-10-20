"""
fetch_gfm.py - download Copernicus Global Flood Monitoring (GFM) flood maps for the Pilot A box.

Source: EODC STAC catalogue (collection "GFM"), https://stac.eodc.eu/api/v1 - no login is used.
Only small layers are fetched (about 1.4 MB per scene item): observed flood extent, exclusion mask, advisory flags.
Use --likelihood to also fetch the classification likelihood layer (about 1.8 MB more per item).
The reference water mask (permanent water) is fetched once per distinct file.

Run from the project root, for example:
    uv run --with pystac-client python fetch_gfm.py --dry-run          # only count, download nothing
    uv run --with pystac-client python fetch_gfm.py                    # download (can be stopped and restarted)

Existing files are skipped, so it is safe to run again. A catalogue of what was downloaded is written to
<out>/items.csv, and <out>/SOURCE.json records where the data came from.
"""
import argparse, csv, datetime as dt, json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pystac_client import Client

STAC_URL = "https://stac.eodc.eu/api/v1"
COLLECTION = "GFM"


def month_chunks(start, end, months):
    d = dt.date(start.year, start.month, 1)
    while d <= end:
        nxt = dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1)
        if d.month in months:
            a, b = max(d, start), min(nxt - dt.timedelta(days=1), end)
            if a <= b:
                yield f"{a.isoformat()}/{b.isoformat()}"
        d = nxt


def download(url, dest, tries=4):
    if dest.exists() and dest.stat().st_size > 0:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            tmp.replace(dest)
            return "ok"
        except Exception as e:  # network hiccup: wait and retry
            last = str(e)[:80]
            time.sleep(2 * (k + 1))
    return f"FAILED: {last}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/external/flood_observed/gfm")
    ap.add_argument("--bbox", nargs=4, type=float, default=[81.9, 25.4, 84.1, 27.1], metavar=("W", "S", "E", "N"))
    ap.add_argument("--start", default="2019-06-01")
    ap.add_argument("--end", default=dt.date.today().isoformat())
    ap.add_argument("--months", default="6,7,8,9,10", help="months to fetch (monsoon season by default)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--likelihood", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    months = {int(m) for m in a.months.split(",")}
    start, end = dt.date.fromisoformat(a.start), dt.date.fromisoformat(a.end)
    layers = {"ensemble_flood_extent": "flood_extent", "exclusion_mask": "exclusion_mask", "advisory_flags": "advisory_flags"}
    if a.likelihood:
        layers["ensemble_likelihood"] = "likelihood"
    out = Path(a.out)

    cat = Client.open(STAC_URL)
    items = []
    for rng in month_chunks(start, end, months):
        for k in range(8):   # the catalogue sometimes drops the connection: wait and try again
            try:
                got = list(cat.search(collections=[COLLECTION], bbox=a.bbox, datetime=rng, max_items=800).items())
                break
            except Exception as e:
                print(f"  catalogue error for {rng}, try {k + 1}/8: {str(e)[:70]}", flush=True)
                time.sleep(10 * (k + 1))
                try: cat = Client.open(STAC_URL)
                except Exception: pass
        else:
            sys.exit(f"Could not read the catalogue for {rng}. Check the internet and run again; finished files are kept.")
        print(f"{rng}: {len(got)} items", flush=True)
        items += got
    print(f"TOTAL items: {len(items)}   layers per item: {list(layers)}")
    if a.dry_run:
        return

    jobs, rows, refs = [], [], {}
    for it in items:
        p = it.properties
        row = {"id": it.id, "datetime": str(it.datetime), "tile": p.get("Equi7Tile"), "flooded_pixels": p.get("flooded_pixels"),
               "floodable_pixels": p.get("floodable_pixels"), "anomaly_detected": p.get("anomaly_detected"),
               "gfm_version": p.get("processing:version")}
        for key, folder in layers.items():
            if key in it.assets:
                href = it.assets[key].href
                local = out / folder / f"{it.datetime:%Y}" / f"{it.datetime:%m}" / href.rsplit("/", 1)[-1]
                jobs.append((href, local))
                row[folder] = str(local.relative_to(out))
        if "reference_water_mask" in it.assets:
            href = it.assets["reference_water_mask"].href
            refs[href] = out / "reference_water" / href.rsplit("/", 1)[-1]
            row["reference_water"] = str(refs[href].relative_to(out))
        rows.append(row)
    jobs += [(h, d) for h, d in refs.items()]

    done = {"ok": 0, "skip": 0, "fail": 0}
    with ThreadPoolExecutor(a.workers) as ex:
        for i, res in enumerate(ex.map(lambda j: download(*j), jobs), 1):
            done["ok" if res == "ok" else "skip" if res == "skip" else "fail"] += 1
            if res.startswith("FAILED"):
                print("  ", res, "|", jobs[i - 1][1].name, flush=True)
            if i % 200 == 0:
                print(f"  {i}/{len(jobs)} files  {done}", flush=True)
    print("files:", done)

    out.mkdir(parents=True, exist_ok=True)
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in rows for k in r}))
        w.writeheader()
        w.writerows(rows)
    json.dump({
        "source": "Copernicus Global Flood Monitoring (GFM), EODC STAC catalogue", "stac_url": STAC_URL, "collection": COLLECTION,
        "bbox_wsen": a.bbox, "date_range": [a.start, a.end], "months": sorted(months), "layers": list(layers) + ["reference_water_mask"],
        "items": len(items), "downloaded_on": dt.date.today().isoformat(),
        "licence": "Check the Copernicus / GFM terms of use before publishing; cite the Copernicus Emergency Management Service.",
        "note": "Items are Equi7 300 km tiles at 20 m. flooded_pixels counts the whole tile, not only the bbox.",
    }, open(out / "SOURCE.json", "w"), indent=2)
    print("catalogue written:", out / "items.csv")


if __name__ == "__main__":
    sys.exit(main())
