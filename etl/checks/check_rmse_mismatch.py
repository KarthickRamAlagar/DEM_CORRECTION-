"""C5: why is the registry RMSE 2.98 m but a recomputed pooled RMSE 3.28 m?
Hypothesis (from row counts): 1,221,354 rows in oof_predictions.parquet = 962,094 rows of the 4 CV strips + 259,260 rows of the frozen test strip.
The registry number is the pooled 4-strip CV value; a pool over every row also includes the frozen strip (RMSE about 4.06 m), which gives about 3.24-3.28.
This script only READS files. Run from the repo root:  uv run python -I etl/checks/check_rmse_mismatch.py"""
import json, pathlib, sys
import numpy as np, pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
OOF = pathlib.Path("model/saved/oof_predictions.parquet"); REG = pathlib.Path("model/saved/registry.json")
for p in (OOF, REG):
    if not p.exists(): sys.exit(f"STOP: {p} not found (run from the repo root).")
d = pd.read_parquet(OOF)
print("columns:", list(d.columns), "rows:", f"{len(d):,}")
need = {"elevation_error_signed", "oof_pred", "fold"}
if not need <= set(d.columns): sys.exit(f"STOP: expected columns {need}. Send me the line above.")
d["res"] = d.elevation_error_signed - d.oof_pred
def stats(x): return len(x), float(np.sqrt(np.mean(x.res ** 2))), float(np.mean(x.res)), float(np.mean(np.abs(x.res)))
print("\nBy fold value (rows, RMSE, bias, MAE) of residual = actual error - oof_pred:")
rows = []
for k, g in d.groupby("fold", dropna=False):
    n, r, b, m = stats(g); rows.append((k, n, r, b, m)); print(f"  fold {k!s:>6}: {n:>10,}  RMSE {r:6.3f}  bias {b:+.3f}  MAE {m:.3f}")
print("\nRaw (no correction) RMSE of the target itself:", round(float(np.sqrt(np.mean(d.elevation_error_signed ** 2))), 3))
n, r, b, m = stats(d); print(f"Pooled over ALL rows: {n:,}  RMSE {r:.3f}  bias {b:+.3f}  MAE {m:.3f}")
reg = json.load(open(REG, encoding="utf-8"))
cv = reg.get("validation", {}).get("cv_4strip_pooled", {})
print("\nRegistry validation.cv_4strip_pooled:", cv)
print("Registry frozen / final keys:", [k for k in reg.get("validation", {}) if k != "cv_4strip_pooled"])
target = cv.get("RMSE")
print("\nTesting which row subsets give the registry number:")
folds = [x[0] for x in rows]
best = None
import itertools
if len(folds) > 8: print(f'  {len(folds)} different fold values: too many to test subsets; send me the table above.'); folds = []
for size in range(1, len(folds)):
    for combo in itertools.combinations(folds, size):
        s = d[d.fold.isin(combo)]; rr = float(np.sqrt(np.mean(s.res ** 2)))
        flag = ""
        if target is not None and abs(rr - target) < 0.005: flag = "  <-- matches the registry"; best = (combo, len(s), rr)
        if flag or size == len(folds) - 1: print(f"  folds {combo}: {len(s):>10,} rows  RMSE {rr:.4f}{flag}")
print()
# the direct test of the hypothesis: leave out the fold that has the frozen strip (259,260 rows)
frozen = [x[0] for x in rows if x[1] == 259260]
if frozen:
    keep = d[~d.fold.isin(frozen)]; rr = float(np.sqrt(np.mean(keep.res ** 2)))
    print(f"All rows except fold {frozen[0]} (the 259,260-row frozen strip): {len(keep):,} rows, RMSE {rr:.4f}  (registry {target})")
    fz = d[d.fold.isin(frozen)]; print(f"Frozen strip alone: RMSE {float(np.sqrt(np.mean(fz.res ** 2))):.4f}  (registry/frozen test: 4.056)")
    explained = target is not None and abs(rr - target) < 0.01
else:
    print("No fold has exactly 259,260 rows, so the frozen strip is not a separate fold value here."); explained = False
print("Mean of the per-fold RMSEs (another common way to average):", round(float(np.mean([x[2] for x in rows])), 4))
print()
if explained:
    print(f"RESULT: EXPLAINED. The registry RMSE {target} is the pooled value over the 4 CV strips ({len(keep):,} rows). The pool over every row ({len(d):,}) also contains the frozen strip, so it is higher. Two numbers, two different row sets; neither is a bug.")
elif best:
    print(f"RESULT: partly explained: the registry RMSE {target} equals the pooled RMSE of folds {best[0]} ({best[1]:,} rows), but that is not the 'everything except the frozen strip' set. Send me this whole output.")
else:
    print("RESULT: NOT explained by row subsets. Send me this whole output.")
