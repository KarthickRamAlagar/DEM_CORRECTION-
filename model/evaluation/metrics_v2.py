"""Metrics used everywhere in v2. LE90 is the EMPIRICAL 90th percentile of |error| (not 1.645 x RMSE)."""
import numpy as np

def summarize(y, pred, void=None, region=None):
    e = y - pred; a = np.abs(e)
    out = {"n": int(len(y)), "RMSE": float(np.sqrt(np.mean(e ** 2))), "MAE": float(a.mean()),
           "MedAE": float(np.median(a)), "LE90": float(np.percentile(a, 90)), "Bias": float(e.mean())}
    if void is not None:
        v = void.astype(bool)
        out["RMSE_nonvoid"] = float(np.sqrt(np.mean(e[~v] ** 2))); out["MAE_nonvoid"] = float(a[~v].mean())
    if region is not None:
        for r, name in [(0, "plains"), (1, "foothill")]:
            m = region == r
            if m.any(): out[f"RMSE_{name}"] = float(np.sqrt(np.mean(e[m] ** 2)))
    return out
