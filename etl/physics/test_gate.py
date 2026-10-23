"""Unit checks of the gate rule.  uv run python -I etl/physics/test_gate.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from run_pilot import gate
def ev(name, p, h, hm): return {"name": name, "dem": {"corrected": {"physics": {"iou": p}, "terrain_whatif_same_rise": {"iou": h}, "terrain_whatif_matched_area": {"iou": hm}}}}
ok = []
def t(n, v): ok.append(v); print(("PASS  " if v else "FAIL  ") + n)
t("2 events never pass", gate([ev("a", .5, .1, .1), ev("b", .5, .1, .1)])["passed"] is False)
t("3 clear wins pass", gate([ev(c, .5, .2, .2) for c in "abc"])["passed"] is True)
t("2 of 3 wins pass", gate([ev("a", .5, .2, .2), ev("b", .5, .2, .2), ev("c", .1, .2, .2)])["passed"] is True)
t("1 of 3 wins fails", gate([ev("a", .5, .2, .2), ev("b", .1, .2, .2), ev("c", .1, .2, .2)])["passed"] is False)
t("beating same-rise but not same-area is not a win", gate([ev(c, .3, .1, .3) for c in "abc"])["passed"] is False)
t("skipped events do not count", gate([ev("a", .5, .2, .2), ev("b", .5, .2, .2), {"name": "c", "skipped": "x"}])["passed"] is False)
sys.exit(0 if all(ok) else 1)
