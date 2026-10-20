"""
fetch_nepal.py - Nepal crops, health facilities and relief-standard sources.

Run from the project root:
    uv run python -u etl/external/fetch_nepal.py 2>&1 | tee -a logs/external/nepal_fetch.txt

Safe to re-run: files already downloaded (size > 0) are skipped. It only writes inside
data/external/crops, data/external/health and data/external/costs_norms, never deletes,
needs no key. Every folder gets a SOURCE.json (url, date, licence, bytes, sha256).
One failing item never stops the others.
"""
import hashlib, json, re, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path("data/external")
UA = {"User-Agent": "DEM-Correction-research/1.0"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              "Accept": "text/html,application/pdf,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"}
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def hdrs(url):
    return BROWSER_UA if ".gov.np" in url else UA


def fix_url(url):
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(p.path), safe="/")
    query = urllib.parse.quote(urllib.parse.unquote(p.query), safe="=&")
    return urllib.parse.urlunsplit((p.scheme, p.netloc, path, query, ""))
MAX_MB = 400
TODAY = date.today().isoformat()
RESULTS = []


def get(url, timeout=120, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(fix_url(url), headers=hdrs(url))
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"{type(last).__name__}: {last}")


def safe_name(text, fallback="file"):
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("._")
    return s[:120] or fallback


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, dest, tries=3):
    """Stream to dest.partial then rename. Returns ('ok'|'skipped'|'too_big', bytes)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return "skipped", dest.stat().st_size
    last = None
    for i in range(tries):
        part = dest.with_name(dest.name + ".partial")
        try:
            req = urllib.request.Request(fix_url(url), headers=hdrs(url))
            with urllib.request.urlopen(req, timeout=120) as r:
                length = int(r.headers.get("Content-Length") or 0)
                if length > MAX_MB * 1024 * 1024:
                    return "too_big", length
                with open(part, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
            if part.stat().st_size == 0:
                raise RuntimeError("empty download")
            part.replace(dest)
            return "ok", dest.stat().st_size
        except Exception as e:  # noqa
            last = e
            if part.exists():
                part.unlink()
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"{type(last).__name__}: {last}")


def resources_from_package(pkg, formats):
    """Pure function: pick downloadable resources out of a CKAN package_show result."""
    out = []
    for r in pkg.get("resources", []):
        fmt = (r.get("format") or "").strip().lower()
        url = r.get("url") or ""
        ext = Path(urllib.parse.urlparse(url).path).suffix.lower().lstrip(".")
        if url and (fmt in formats or ext in formats):
            out.append({"name": r.get("name") or "", "url": url, "format": fmt or ext})
    return out


def record(item, status, detail=""):
    RESULTS.append((item, status, detail))
    print(f"  [{status}] {item} {detail}", flush=True)


def write_source(folder, entries):
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / "SOURCE.json"
    old = []
    if p.exists():
        try:
            old = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            old = []
    seen = {e.get("url") for e in entries}
    merged = [e for e in old if e.get("url") not in seen] + entries
    p.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch_ckan(base, ident, folder, formats):
    print(f"\nCKAN {base}  dataset={ident}", flush=True)
    try:
        pkg = json.loads(get(f"{base}/action/package_show?id={urllib.parse.quote(ident)}"))["result"]
    except Exception as e:
        record(ident, "FAILED", f"package_show: {e}")
        return
    licence = pkg.get("license_title") or pkg.get("license_id") or "not stated"
    print(f"  title: {pkg.get('title')} | licence: {licence} | modified: {pkg.get('metadata_modified')}")
    res = resources_from_package(pkg, formats)
    if not res:
        record(ident, "NO FILES", f"no resource with format in {sorted(formats)}")
        return
    entries = []
    for r in res:
        name = safe_name(r["name"] or Path(urllib.parse.urlparse(r["url"]).path).name)
        ext = Path(urllib.parse.urlparse(r["url"]).path).suffix.lstrip(".").lower() or r["format"]
        if not name.lower().endswith("." + ext):
            name += "." + ext
        dest = folder / name
        try:
            status, size = download(r["url"], dest)
        except Exception as e:
            record(f"{ident}/{name}", "FAILED", str(e))
            continue
        if status == "too_big":
            record(f"{ident}/{name}", "TOO BIG", f"{size/1e6:.0f} MB > {MAX_MB} MB, fetch by hand")
            continue
        record(f"{ident}/{name}", status.upper(), f"{size/1e6:.2f} MB")
        entries.append({"dataset": ident, "title": pkg.get("title"), "file": name, "url": r["url"],
                        "licence": licence, "downloaded": TODAY, "bytes": size,
                        "sha256": sha256_of(dest)})
    if entries:
        write_source(folder, entries)


def fetch_files(urls, folder, licence, note):
    print(f"\nFiles -> {folder}", flush=True)
    entries = []
    for url in urls:
        name = safe_name(urllib.parse.unquote(Path(urllib.parse.urlparse(url).path).name))
        if len(re.sub(r"[^A-Za-z0-9]", "", name)) < 8:
            name = "file_" + hashlib.md5(url.encode("utf-8")).hexdigest()[:8] + ".pdf"
        dest = folder / name
        try:
            status, size = download(url, dest)
        except Exception as e:
            record(name, "FAILED", str(e))
            continue
        if status == "too_big":
            record(name, "TOO BIG", f"{size/1e6:.0f} MB > {MAX_MB} MB, fetch by hand")
            continue
        record(name, status.upper(), f"{size/1e6:.2f} MB")
        entries.append({"file": name, "url": url, "licence": licence, "note": note,
                        "downloaded": TODAY, "bytes": size, "sha256": sha256_of(dest)})
    if entries:
        write_source(folder, entries)


def fetch_pdfs_from_page(page_url, folder, licence, note):
    print(f"\nPage {page_url}", flush=True)
    try:
        html = get(page_url).decode("utf-8", "ignore")
    except Exception as e:
        record(page_url, "FAILED", str(e))
        return
    links = sorted({urllib.parse.urljoin(page_url, m) for m in re.findall(r'href=["\']([^"\']+\.pdf)["\']', html, re.I)})
    if not links:
        record(page_url, "NO FILES", "no .pdf link on the page, download by hand")
        return
    fetch_files(links, folder, licence, note)


def main():
    print("Nepal fetch started", TODAY, flush=True)

    # ---- CROPS --------------------------------------------------------------------
    ODN = "https://api.opendatanepal.com/api/3"
    crop_fmt = {"csv", "xls", "xlsx"}
    for ident in ["area-production-and-yield-of-cereal-crops-in-districts-2014-2015",
                  "statistical-information-on-nepalese-agriculture-2073-74"]:
        fetch_ckan(ODN, ident, ROOT / "crops" / "nepal_opendatanepal" / ident, crop_fmt)

    moald = ["https://giwmscdnone.gov.np/media/pdf_upload/MOALD-Statical-Book-Magre-2081-Final_wgfs8ph.pdf",
             "https://giwmscdnone.gov.np/media/pdf_upload/Statistical%20Information%20on%20Nepalese%20Agriculture,%202080_81_a7s8aj4.pdf",
             "https://giwmscdnone.gov.np/media/app/public/285/posts/1715754883_66.pdf"]
    fetch_files(moald, ROOT / "crops" / "nepal_moald_statbook", "Government of Nepal publication, terms not checked",
                "MoALD Statistical Information on Nepalese Agriculture (district tables inside PDFs)")

    # ---- HEALTH -------------------------------------------------------------------
    HDX = "https://data.humdata.org/api/3"
    health_fmt = {"csv", "xlsx", "xls", "geojson", "json", "zip", "gpkg"}
    for ident in ["hotosm_npl_health_facilities", "nepal-health-facilities-cod"]:
        fetch_ckan(HDX, ident, ROOT / "health" / "nepal_hdx" / ident, health_fmt)

    # ---- NORMS --------------------------------------------------------------------
    fetch_pdfs_from_page("https://dpnet.org.np/resource-detail/1201", ROOT / "costs_norms" / "nepal_moha_standard",
                         "Government of Nepal legal document", "MoHA standard for rescue and relief of disaster-affected families, 7th amendment (2077 BS)")

    print("\n================ SUMMARY ================")
    for item, status, detail in RESULTS:
        print(f"{status:9} {item} {detail}")
    bad = [r for r in RESULTS if r[1] in ("FAILED", "NO FILES", "TOO BIG")]
    print(f"\n{len(RESULTS)} items, {len(bad)} need attention.")
    print("Manual: ICIMOD district cereal/vegetable/cash-crop tables (Download button) at")
    print("  https://rds.icimod.org/Home/DataDetail?metadataId=17200  -> save into data/external/crops/nepal_icimod/")


if __name__ == "__main__":
    main()
