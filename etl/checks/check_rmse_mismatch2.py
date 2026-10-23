"""C5 part 2: the 'all rows except the frozen strip' test did NOT reproduce the registry RMSE (3.04 vs 2.98).
This script only READS files. It compares five metrics (RMSE, MAE, MedAE, LE90, bias) for many row sets against the registry numbers,
shows per-fold raw error vs corrected error, file dates, duplicate coordinates, and searches the repo text files for the registry number.
Run from the repo root:  uv run python -I etl/checks/check_rmse_mismatch2.py"""
import json, os, pathlib, re, sys, time
import numpy as np, pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
OOF = pathlib.Path("model/saved/oof_predictions.parquet"); REG = pathlib.Path("model/saved/registry.json")
for p in (OOF, REG):
    if not p.exists(): sys.exit(f"STOP: {p} not found (run from the repo root).")
d = pd.read_parquet(OOF)
d["res"] = d.elevation_error_signed - d.oof_pred
reg = json.load(open(REG, encoding="utf-8")); cv = reg.get("validation", {}).get("cv_4strip_pooled", {})
def met(x):
    a = np.abs(x.res.to_numpy())
    return {"RMSE": float(np.sqrt(np.mean(x.res.to_numpy() ** 2))), "MAE": float(a.mean()), "MedAE": float(np.median(a)), "LE90": float(np.quantile(a, 0.90)), "Bias": float(x.res.mean())}
KEYS = ["RMSE", "MAE", "MedAE", "LE90", "Bias"]
print("1. Registry validation.cv_4strip_pooled:", {k: cv.get(k) for k in KEYS})
print("   all registry validation keys:", list(reg.get("validation", {}).keys()))
print("   all registry top-level keys:", list(reg.keys()))
print("\n2. Five metrics for each row set (difference to registry in brackets; RMSE/MAE/MedAE/LE90 in %, bias in metres):")
folds = sorted(d.fold.dropna().unique().tolist())
sets = [("all rows", d)]
for f in folds: sets.append((f"fold {f} only", d[d.fold == f]))
for f in folds: sets.append((f"all except fold {f}", d[d.fold != f]))
best = None
for name, x in sets:
    m = met(x)
    diffs = []
    for k in KEYS:
        r = cv.get(k)
        if r is None: diffs.append("n/a"); continue
        diffs.append(f"{(m[k]-r):+.3f}m" if k == "Bias" else f"{(m[k]/r-1)*100:+.1f}%")
    score = sum(abs(m[k] / cv[k] - 1) for k in KEYS if cv.get(k) not in (None, 0) and k != "Bias")
    if name.startswith("all except") and (best is None or score < best[0]): best = (score, name)
    print(f"   {name:<20} n={len(x):>9,}  " + "  ".join(f"{k} {m[k]:6.3f} ({dd})" for k, dd in zip(KEYS, diffs)))
if best: print(f"   closest 'all except one fold' set: {best[1]} (sum of relative differences {best[0]*100:.1f}%)")
print("\n3. Per fold: raw error (no correction) vs error after correction:")
for f in folds:
    x = d[d.fold == f]; raw = float(np.sqrt(np.mean(x.elevation_error_signed ** 2))); cor = float(np.sqrt(np.mean(x.res ** 2)))
    print(f"   fold {f}: rows {len(x):>9,}  lat {x.latitude.min():.2f}..{x.latitude.max():.2f}  raw RMSE {raw:.3f}  corrected RMSE {cor:.3f}  gain {(1-cor/raw)*100:+.1f}%")
print("\n4. File dates (a registry older than the OOF file, or the reverse, suggests the two come from different runs):")
for p in (OOF, REG): print("  ", p, time.strftime("%Y-%m-%d %H:%M", time.localtime(p.stat().st_mtime)))
print("\n5. Duplicate coordinates in the OOF file:", f"{int(d.duplicated(['latitude','longitude']).sum()):,}", "rows share a latitude/longitude with an earlier row")
print("   rows with NaN in oof_pred or target:", int(d[["oof_pred", "elevation_error_signed"]].isna().any(axis=1).sum()))
print("\n6. Where does the number 2.9821 (or 1.5518) appear in the repo text files? (up to 15 hits)")
pat = re.compile(r"2\.9821|1\.5518|2\.982\b")
hits = 0
for root in ("model", "etl", "scripts", "docs", "notebooks", "server", "."):
    base = pathlib.Path(root)
    if not base.exists(): continue
    it = base.glob("*") if root == "." else base.rglob("*")
    for p in it:
        if hits >= 15: break
        if not p.is_file() or p.suffix.lower() not in {".py", ".json", ".md", ".txt", ".log", ".ipynb", ".csv", ".yaml", ".yml"}: continue
        if any(s in p.parts for s in ("node_modules", ".git", ".venv", "evidence")) or p.stat().st_size > 5_000_000 or ".bak" in p.name or p.name.startswith("check_rmse_mismatch"): continue
        try: txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception: continue
        for i, line in enumerate(txt.splitlines(), 1):
            if pat.search(line): print(f"   {p}:{i}: {line.strip()[:170]}"); hits += 1
            if hits >= 15: break
    if hits >= 15: break
if hits == 0: print("   (no hits)")
print("\n7. Does the flood scoring code reproject the EQUI7 tiles? (C6; lines that mention reprojection in etl/)")
pat2 = re.compile(r"reproject|calculate_default_transform|WarpedVRT|rasterio\.warp|from rasterio import warp")
n2 = 0
for p in pathlib.Path("etl").rglob("*.py"):
    if ".bak" in p.name or p.name.startswith("check_rmse_mismatch") or n2 >= 12: continue
    try: lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception: continue
    for i, line in enumerate(lines, 1):
        if pat2.search(line): print(f"   {p}:{i}: {line.strip()[:150]}"); n2 += 1
        if n2 >= 12: break
if n2 == 0: print("   (no lines found: the scoring code may NOT reproject. Send me this output.)")
print("\nDone. Send me this whole output.")
