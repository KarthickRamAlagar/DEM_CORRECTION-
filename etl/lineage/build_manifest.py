"""Lineage manifest (master prompt section 34): where each file came from, when, and which code and model version belong with it.
Run from the repo root:  uv run python etl/lineage/build_manifest.py [--root .] [--hash-all]
Writes data/processed/sdg/lineage/manifest.json. Reads only. Files over 1 GB are listed with size and time but not hashed unless --hash-all
(hashing a 2 GB file takes minutes). A file whose size and time did not change since the last run reuses its old hash."""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

FOLDERS = ["data/external", "data/final", "data/processed/sdg", "model/saved", "model/evaluation"]
SKIP = {"quality", "lineage", ".venv", "node_modules", ".git", "__pycache__"}
SKIP_SUFFIX = (".bak", ".tmp", ".lock")
PKGS = ["pandas", "pyarrow", "numpy", "scikit-learn", "lightgbm", "catboost", "rasterio", "shapely", "fastapi", "duckdb", "mlflow"]
BIG = 1_000_000_000


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def git(root: Path, *args):
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=20)
        return (r.stdout.strip() or None) if r.returncode == 0 else None
    except Exception: return None

def iso(ts): return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--root", default="."); ap.add_argument("--hash-all", action="store_true"); a = ap.parse_args()
    root = Path(a.root).resolve(); out = root / "data" / "processed" / "sdg" / "lineage" / "manifest.json"; out.parent.mkdir(parents=True, exist_ok=True)
    old = {}
    if out.exists():
        try: old = {x["path"]: x for x in json.loads(out.read_text(encoding="utf-8")).get("artefacts", [])}
        except Exception: old = {}
    arts = []
    for fol in FOLDERS:
        base = root / fol
        if not base.exists(): continue
        for p in sorted(base.rglob("*")):
            rel = p.relative_to(root)
            if not p.is_file() or set(rel.parts) & SKIP or ".bak" in p.name or p.name.endswith(SKIP_SUFFIX): continue
            st = p.stat(); key = rel.as_posix(); prev = old.get(key)
            rec = {"path": key, "bytes": st.st_size, "modified_utc": iso(st.st_mtime), "sha256": None, "hash_note": None}
            if prev and prev.get("bytes") == st.st_size and prev.get("modified_utc") == rec["modified_utc"] and prev.get("sha256"): rec["sha256"] = prev["sha256"]; rec["hash_note"] = "reused (size and time unchanged)"
            elif st.st_size > BIG and not a.hash_all: rec["hash_note"] = "not hashed: larger than 1 GB (use --hash-all)"
            else: print("hash", key); rec["sha256"] = sha256(p)
            arts.append(rec)
    # external-source records written by the fetch scripts
    sources = None
    for cand in [root / "data/external/MANIFEST.json", *sorted((root / "data").rglob("MANIFEST.json"))[:3]]:
        if cand.exists():
            try: sources = {"file": cand.relative_to(root).as_posix(), "content": json.loads(cand.read_text(encoding="utf-8"))}; break
            except Exception: pass
    # model record from the evaluation summary the pipeline already writes
    model = None
    for cand in sorted(root.rglob("eval_summary.json"))[:5]:
        if set(cand.relative_to(root).parts) & SKIP: continue
        try:
            d = json.loads(cand.read_text(encoding="utf-8")); model = {"file": cand.relative_to(root).as_posix(), **{k: d.get(k) for k in ("model_version", "created_utc", "algorithm", "target", "validation_design", "winner", "selection_rule")}}; break
        except Exception: pass
    pk = {}
    for n in PKGS:
        try: pk[n] = metadata.version(n)
        except Exception: pk[n] = None
    lock = root / "uv.lock"
    code = {"git_commit": git(root, "rev-parse", "--verify", "HEAD"), "git_branch": git(root, "rev-parse", "--abbrev-ref", "HEAD"), "git_uncommitted_files": (len((git(root, "status", "--porcelain") or "").splitlines()) if git(root, "rev-parse", "--verify", "HEAD") else None),
            "python": sys.version.split()[0], "packages": pk, "uv_lock_sha256": (sha256(lock) if lock.exists() else None)}
    n_hashed = sum(1 for x in arts if x["sha256"])
    chain = [
        {"step": "Source", "where": (sources["file"] if sources else None), "recorded": bool(sources)},
        {"step": "Collection date", "where": ("inside the source records above" if sources else None), "recorded": bool(sources)},
        {"step": "Raw dataset", "where": "data/external", "files": len([x for x in arts if x["path"].startswith("data/external")]), "recorded": any(x["path"].startswith("data/external") for x in arts)},
        {"step": "Processing version", "where": "git commit of the ETL scripts", "value": code["git_commit"], "recorded": code["git_commit"] is not None},
        {"step": "Feature version", "where": "data/final", "files": len([x for x in arts if x["path"].startswith("data/final")]), "recorded": any(x["path"].startswith("data/final") for x in arts)},
        {"step": "Model version", "where": (model["file"] if model else None), "value": (model or {}).get("model_version"), "recorded": bool(model and model.get("model_version"))},
        {"step": "Prediction", "where": "computed on request by the DEM engine; the report carries the model version and the date used"},
        {"step": "Report", "where": "DEM-AREA-SDG PDF; carries this manifest's commit and model version (patch 8d)"},
    ]
    man = {"created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "root": str(root), "code": code, "model": model, "sources": sources, "chain": chain,
           "artefact_count": len(arts), "artefacts_hashed": n_hashed, "artefacts": arts}
    out.write_text(json.dumps(man, indent=1, default=str), encoding="utf-8")
    print(f"\nWrote {out}\n{len(arts)} files listed, {n_hashed} hashed. Git commit: {code['git_commit']}. Model version: {(model or {}).get('model_version')}")

if __name__ == "__main__": main()
