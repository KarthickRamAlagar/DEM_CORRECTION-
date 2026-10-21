"""Summarise item_counts.csv: raw vs corrected HAND vs GFM observed flood.
Threshold chosen on TRAIN years, scored on TEST years. Writes small CSVs to data/processed/sdg/flood_eval/."""
import sys, os, argparse
import numpy as np, pandas as pd
sys.stdout.reconfigure(encoding="utf-8")
ROOT = "C:/Users/KARTHI/Documents/DEM_CORRECTION_reorganized/"
D = ROOT + "data/processed/sdg/flood_eval/"
ap = argparse.ArgumentParser()
ap.add_argument("--src", default=D + "item_counts.csv")
ap.add_argument("--train-end", type=int, default=2021)
ap.add_argument("--min-flood", type=int, default=200, help="min flooded cells (100 m) for a day to count")
ap.add_argument("--out", default=D)
a = ap.parse_args()
df = pd.read_csv(a.src)
df["year"] = df["day"].str[:4].astype(int)
df["split"] = np.where(df["year"] <= a.train_end, "train", "test")
views = {"unflagged": df["flag"].astype(str) == "False", "all_scenes": df["flag"].notna()}

def met(g):
    tp, fp, fn, tn = (g[c].sum() for c in ("tp", "fp", "fn", "tn"))
    d = lambda x, y: x / y if y > 0 else np.nan
    return pd.Series(dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=d(tp, tp + fp), recall=d(tp, tp + fn),
                          f1=d(2 * tp, 2 * tp + fp + fn), iou=d(tp, tp + fp + fn), fpr=d(fp, fp + tn),
                          flood_share=d(tp + fn, tp + fp + fn + tn)))

def aucs(c):  # approximate, from the threshold grid
    c = c.sort_values("t")
    tpr = np.r_[0, (c.tp / (c.tp + c.fn)).values, 1]; fpr = np.r_[0, (c.fp / (c.fp + c.tn)).values, 1]
    roc = float((getattr(np, 'trapezoid', None) or np.trapz)(tpr, fpr))
    rec = np.r_[0, (c.tp / (c.tp + c.fn)).values]; prec = (c.tp / (c.tp + c.fp).replace(0, np.nan)).fillna(1).values
    return roc, float(np.sum(np.diff(rec) * prec))

rows, picks, aucrows = [], [], []
for vname, vmask in views.items():
    for var in df["variant"].unique():
        sub = df[vmask & (df["variant"] == var)]
        for dem in ("raw", "corrected"):
            s = sub[sub["dem"] == dem]
            tab = s.groupby(["split", "t"]).apply(met).reset_index()
            tab.insert(0, "dem", dem); tab.insert(0, "variant", var); tab.insert(0, "view", vname)
            rows.append(tab)
            for sp in ("train", "test"):
                c = tab[tab["split"] == sp]
                if len(c) and c["tp"].sum() + c["fn"].sum() > 0:
                    r, p = aucs(c); aucrows.append(dict(view=vname, variant=var, dem=dem, split=sp, roc_auc_approx=r, pr_auc_approx=p))
            tr = tab[tab["split"] == "train"].dropna(subset=["iou"])
            if len(tr):
                bt = float(tr.loc[tr["iou"].idxmax(), "t"])
                te = tab[(tab["split"] == "test") & (tab["t"] == bt)]
                picks.append(dict(view=vname, variant=var, dem=dem, best_t_train=bt, train_iou=float(tr["iou"].max()),
                                  **({f"test_{k}": float(te.iloc[0][k]) for k in ("iou", "f1", "precision", "recall")} if len(te) else {})))
pd.concat(rows).to_csv(a.out + "summary_by_threshold.csv", index=False)
pk = pd.DataFrame(picks); pk.to_csv(a.out + "summary_chosen_threshold.csv", index=False)
au = pd.DataFrame(aucrows); au.to_csv(a.out + "summary_auc.csv", index=False)
pd.set_option("display.width", 200)
print("=== threshold chosen on TRAIN years (<= %d), scored on TEST years ===" % a.train_end); print(pk.round(4).to_string(index=False))
print("\n=== approximate AUCs (from the threshold grid) ==="); print(au.round(4).to_string(index=False))

out = []
rng = np.random.default_rng(0)
for vname, vmask in views.items():
    sub = df[vmask & (df["variant"] == "main") & (df["split"] == "test")]
    bt = {d: pk[(pk.view == vname) & (pk.variant == "main") & (pk.dem == d)]["best_t_train"] for d in ("raw", "corrected")}
    if any(len(v) == 0 for v in bt.values()): continue
    per = {}
    for d in ("raw", "corrected"):
        s = sub[(sub["dem"] == d) & (sub["t"] == float(bt[d].iloc[0]))].groupby("day")[["tp", "fp", "fn"]].sum()
        s["flood"] = s["tp"] + s["fn"]; s["iou"] = s["tp"] / (s["tp"] + s["fp"] + s["fn"]).replace(0, np.nan); per[d] = s
    j = per["raw"][["iou", "flood"]].join(per["corrected"][["iou"]], lsuffix="_raw", rsuffix="_cor").dropna()
    j = j[j["flood"] >= a.min_flood]
    if len(j) < 5: print(f"\n{vname}: only {len(j)} test days with enough flood - paired comparison skipped"); continue
    diff = (j["iou_cor"] - j["iou_raw"]).values
    bs = [rng.choice(diff, len(diff)).mean() for _ in range(2000)]
    out.append(dict(view=vname, days=len(j), mean_iou_raw=j["iou_raw"].mean(), mean_iou_corrected=j["iou_cor"].mean(),
                    mean_diff=diff.mean(), ci95_low=np.percentile(bs, 2.5), ci95_high=np.percentile(bs, 97.5),
                    days_corrected_better=int((diff > 0).sum())))
pd.DataFrame(out).to_csv(a.out + "summary_paired_days.csv", index=False)
print("\n=== paired per-day IoU, test years (bootstrap over days) ==="); print(pd.DataFrame(out).round(4).to_string(index=False))
print("\nwritten:", a.out)
