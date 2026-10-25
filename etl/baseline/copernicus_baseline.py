"""Global-DEM baseline: how does Copernicus GLO-30 compare with raw and corrected CartoDEM
at the same ICESat-2 ground-truth points?  Read-only; writes evidence/baseline/<stamp>/.

Run from the project root:
    uv run python -I etl/baseline/copernicus_baseline.py            (add --limit 200000 for a quick try)

What it compares (same points, same reference height elevation_ref):
  1. CartoDEM raw                      error = raw_z - elevation_ref
  2. CartoDEM corrected (out-of-fold)  error = raw_z + oof_pred - elevation_ref
  3. Copernicus GLO-30 as is           error = cop_z - elevation_ref
  4. Copernicus with a constant offset learned on the OTHER folds (fair against a fitted model)
Each is reported as RMSE, MAE, bias and "centred RMSE" (RMSE after removing the bias; it does not
depend on the height datum, so it is the safest single number when datums differ).
Points are also split: plains (lat < 27.0) and foothill (lat >= 27.0), and by fold.
"""
import argparse, glob, json, os, sys, time
import numpy as np, pandas as pd

OOF = "model/saved/oof_predictions.parquet"
GOLD = "data/final/golden_dataset.parquet"
COP_GLOB = "data/raw/dem/**/*.tif"

def stats(err):
    e = np.asarray(err, float); e = e[np.isfinite(e)]
    if e.size == 0: return dict(n=0)
    b = float(e.mean())
    return dict(n=int(e.size), rmse=float(np.sqrt((e**2).mean())), mae=float(np.abs(e).mean()),
                bias=b, centred_rmse=float(np.sqrt(((e-b)**2).mean())))

def sample_tiles(lat, lon, files):
    import rasterio
    out = np.full(lat.shape, np.nan); used = 0
    for fp in files:
        with rasterio.open(fp) as ds:
            b = ds.bounds
            m = (lon >= b.left) & (lon < b.right) & (lat > b.bottom) & (lat <= b.top) & ~np.isfinite(out)
            if not m.any(): continue
            used += 1
            arr = ds.read(1).astype("float64")
            if ds.nodata is not None: arr[arr == ds.nodata] = np.nan
            arr[arr < -500] = np.nan
            rows, cols = rasterio.transform.rowcol(ds.transform, lon[m], lat[m])
            rows = np.clip(np.asarray(rows), 0, arr.shape[0]-1); cols = np.clip(np.asarray(cols), 0, arr.shape[1]-1)
            out[m] = arr[rows, cols]
    return out, used

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cop-glob", default=COP_GLOB); a = ap.parse_args()
    oof = pd.read_parquet(OOF)
    gold = pd.read_parquet(GOLD, columns=["latitude", "longitude", "raw_z", "elevation_ref"])
    for d in (oof, gold):
        d["_k"] = (d.latitude.round(6).astype(str) + "_" + d.longitude.round(6).astype(str))
    gold = gold.drop_duplicates("_k")
    df = oof.merge(gold[["_k", "raw_z", "elevation_ref"]], on="_k", how="inner")
    print(f"points: oof {len(oof):,}  matched to golden {len(df):,}")
    if len(df) < 0.95 * len(oof): sys.exit("STOP: fewer than 95% of points matched; check the two files.")
    # consistency of the label definition: elevation_ref - raw_z == elevation_error_signed
    chk = float(np.nanmax(np.abs((df.elevation_ref - df.raw_z) - df.elevation_error_signed)))
    bad = int((np.abs((df.elevation_ref - df.raw_z) - df.elevation_error_signed) > 0.01).sum())
    print(f"label check max |(ref - raw_z) - error_signed| = {chk:.4f} m; rows differing by more than 1 cm: {bad:,} of {len(df):,}")
    if bad: df = df[np.abs((df.elevation_ref - df.raw_z) - df.elevation_error_signed) <= 0.01]; print(f"dropped those {bad:,} rows (golden was rebuilt; they no longer match the saved predictions)")
    if a.limit: df = df.sample(a.limit, random_state=0)
    files = sorted(f for f in glob.glob(a.cop_glob, recursive=True) if "cop" in os.path.basename(f).lower() or "copernicus" in f.lower())
    if not files: sys.exit("STOP: no Copernicus tiles found; pass --cop-glob 'path/*.tif'")
    print(f"Copernicus tiles: {len(files)}")
    t0 = time.time()
    df["cop_z"], used = sample_tiles(df.latitude.values, df.longitude.values, files)
    print(f"sampled in {time.time()-t0:.0f} s, tiles used {used}, points with a value {df.cop_z.notna().sum():,}")
    d = df[df.cop_z.notna()].copy()
    d["e_raw"] = d.raw_z - d.elevation_ref
    d["e_corr"] = d.raw_z + d.oof_pred - d.elevation_ref
    d["e_cop"] = d.cop_z - d.elevation_ref
    # per-region offset: one shift for plains, one for foothill, learned on the other folds
    d["_reg"] = (d.latitude >= 27).astype(int)
    def reg_off(col):
        o = d.groupby(["fold", "_reg"]).size().reset_index()[["fold", "_reg"]]
        m = {}
        for f, r in zip(o.fold, o._reg): m[(f, r)] = d.loc[(d.fold != f) & (d._reg == r), col].mean()
        return pd.Series([m[(f, r)] for f, r in zip(d.fold, d._reg)], index=d.index)
    # Copernicus + offset learned on the other folds
    off = {f: (d.loc[d.fold != f, "e_cop"].mean()) for f in d.fold.unique()}
    d["e_cop_off"] = d.e_cop - d.fold.map(off)
    offr = {f: (d.loc[d.fold != f, "e_raw"].mean()) for f in d.fold.unique()}
    d["e_raw_off"] = d.e_raw - d.fold.map(offr)      # raw CartoDEM + one constant shift: the honest "do nothing clever" baseline
    d["e_raw_reg"] = d.e_raw - reg_off("e_raw"); d["e_cop_reg"] = d.e_cop - reg_off("e_cop")
    groups = {"all": d.index == d.index, "plains (lat<27)": d.latitude < 27, "foothill (lat>=27)": d.latitude >= 27}
    res = {}
    for g, m in groups.items():
        res[g] = {k: stats(d.loc[m, c]) for k, c in [("CartoDEM raw", "e_raw"), ("CartoDEM raw + constant offset (other folds)", "e_raw_off"), ("CartoDEM raw + per-region offset", "e_raw_reg"), ("CartoDEM corrected", "e_corr"),
                                                      ("Copernicus", "e_cop"), ("Copernicus + per-region offset", "e_cop_reg"), ("Copernicus + offset (other folds)", "e_cop_off")]}
    res["by_fold"] = {int(f): {k: stats(d.loc[d.fold == f, c]) for k, c in [("CartoDEM corrected", "e_corr"), ("Copernicus + offset (other folds)", "e_cop_off")]} for f in sorted(d.fold.unique())}
    # win rate: share of points where corrected CartoDEM is closer to the reference than Copernicus+offset
    res["share_points_corrected_closer_than_raw_region_offset"] = float((d.e_corr.abs() < d.e_raw_reg.abs()).mean())
    res["share_points_corrected_closer_than_raw_offset"] = float((d.e_corr.abs() < d.e_raw_off.abs()).mean())
    res["share_points_corrected_closer"] = float((d.e_corr.abs() < d.e_cop_off.abs()).mean())
    res["meta"] = dict(label_check_max_abs=chk, n_oof=len(oof), n_matched=len(df), tiles=len(files),
                       note="Copernicus GLO-30 was not among the 29 model features (verify: features_v2.py)")
    out = os.path.join("evidence", "baseline", time.strftime("%Y%m%d_%H%M")); os.makedirs(out, exist_ok=True)
    json.dump(res, open(os.path.join(out, "baseline_result.json"), "w"), indent=1)
    rows = [(g, k, v.get("n"), v.get("rmse"), v.get("mae"), v.get("bias"), v.get("centred_rmse")) for g in groups for k, v in res[g].items()]
    tab = pd.DataFrame(rows, columns=["group", "dem", "n", "rmse_m", "mae_m", "bias_m", "centred_rmse_m"]).round(3)
    tab.to_csv(os.path.join(out, "baseline_table.csv"), index=False)
    print(tab.to_string(index=False)); print("share closer than raw+per-region offset:", round(res["share_points_corrected_closer_than_raw_region_offset"], 3), "| closer than raw+offset:", round(res["share_points_corrected_closer_than_raw_offset"], 3), "| closer than Copernicus+offset:", round(res["share_points_corrected_closer"], 3))
    print("written:", out)

if __name__ == "__main__":
    main()
