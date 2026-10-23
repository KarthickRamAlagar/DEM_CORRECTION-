"""Unit checks of the stricter scoring and gate (patch 14c).  uv run python -I etl/physics/test_sweep_units.py"""
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from run_sweep import score_full, gate_v2, block_boot, parse_variant, matched_2d
ok = []
def t(n, v): ok.append(bool(v)); print(("PASS  " if v else "FAIL  ") + n)
rng = np.random.default_rng(1); ny, nx = 60, 80
yy, xx = np.mgrid[0:ny, 0:nx]
truth = ((xx - 40) ** 2 + (yy - 30) ** 2) < 15 ** 2          # one round flood
valid = np.ones((ny, nx), bool); valid[:5, :] = False
hand = np.hypot(xx - 40, yy - 30) + rng.normal(0, 3, (ny, nx))   # a terrain rule that is only partly right
def ev(name, depth, rise=10.0):
    sc = score_full(depth, hand, rise, truth, valid, B=8); return {"name": name, "obs_date": "2022-01-01", "dem": {"corrected": sc}}
# 1. a model that floods everything gets exactly the flood-everything score and never wins
allwet = ev("a", np.ones((ny, nx)))
p = allwet["dem"]["corrected"]
t("flood-everything model: IoU equals the flood-everything baseline", abs(p["physics"]["iou"] - p["all_wet"]["iou"]) < 1e-9)
t("flood-everything model: does not win the gate event", gate_v2([allwet] * 3, "x", "tune")["passed"] is False)
# 2. a model that follows the truth wins
good = ev("g", np.where(((xx - 40) ** 2 + (yy - 30) ** 2) < 14 ** 2, 1.0, 0.0))
gg = gate_v2([good] * 3, "x", "tune")
t("good model passes with 3 events", gg["passed"] is True and gg["events_won"] == 3)
t("good model with 2 events cannot pass", gate_v2([good] * 2, "x", "tune")["passed"] is False)
t("2 of 3 wins pass, 1 of 3 fails", gate_v2([good, good, allwet], "x", "tune")["passed"] is True and gate_v2([good, allwet, allwet], "x", "tune")["passed"] is False)
# 3. random-same-area baseline matches a Monte Carlo
k = 900; N = int(valid.sum()); T = int((truth & valid).sum()); vals = []
idx = np.flatnonzero(valid.ravel())
for _ in range(400):
    pick = rng.choice(idx, k, replace=False); pr = np.zeros(ny * nx, bool); pr[pick] = True; pr = pr.reshape(ny, nx)
    tp = (pr & truth & valid).sum(); vals.append(tp / ((pr | (truth & valid)).sum()))
dep = np.zeros((ny, nx)); dep.ravel()[rng.choice(idx, k, replace=False)] = 1.0
rr = score_full(dep, hand, 10.0, truth, valid, B=8)["random_same_area"]["iou"]
t(f"random-same-area baseline {rr:.4f} close to simulation {np.mean(vals):.4f}", abs(rr - np.mean(vals)) < 0.01)
# 4. bootstrap: identical maps give a range around 0, a clearly better map gives a range above 0
b = block_boot(valid, truth, {"physics": truth & valid, "other": truth & valid}, B=8)["physics_minus_other"]
t("identical maps: range is exactly 0", abs(b[0]) < 1e-12 and abs(b[1]) < 1e-12)
noisy = (truth ^ (rng.random((ny, nx)) < 0.25)) & valid
b2 = block_boot(valid, truth, {"physics": truth & valid, "other": noisy}, B=8)["physics_minus_other"]
t("better map: range above 0", b2[0] > 0)
# 5. helpers
t("matched area has the same cell count", matched_2d(hand, valid, 500).sum() == 500)
t("variants parse", parse_variant("closed")["edges"] == "" and parse_variant("open")["edges"] == "NSEW" and parse_variant("open_drain")["drain_mm_day"] == 30.0 and parse_variant("open_drain80")["drain_mm_day"] == 80.0)
sys.exit(0 if all(ok) else 1)
