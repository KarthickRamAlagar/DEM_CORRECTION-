"""GET /api/sdg/physics/status: result of the physics flood pilot, read from data/processed/sdg/physics/.  (Patch 14c: reads the STRICTER check, physics_gate_v2.json.)
Read-only. The app shows the pilot only when the stricter check passed on events that were not used to choose the model setup.
If it was not run, or did not pass, the answer says so and the app shows nothing.  The first pilot file (physics_gate.json) is no longer used here: it passed a weaker test."""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()
DIR = Path(__file__).resolve().parent.parent / "data" / "processed" / "sdg" / "physics"

def _read(name):
    try: return json.loads((DIR / name).read_text(encoding="utf-8"))
    except Exception: return None

@router.get("/physics/status")
def physics_status():
    g = _read("physics_gate_v2.json")
    if not g or g.get("role") != "final":
        return {"available": False, "passed": False, "reason": "The stricter physics check has not been run on held-out events, so the pilot is not shown."}
    out = {"available": True, "passed": bool(g.get("passed")), "label": g.get("label"), "rule": g.get("rule"), "reason": g.get("reason"), "events_scored": g.get("events_scored"),
           "events_won": g.get("events_won"), "mean_gain_over_best_trivial": g.get("mean_gain_over_best_trivial"), "variant": g.get("variant"), "built_utc": g.get("built_utc")}
    if out["passed"]:
        out["window"] = g.get("window"); out["assumptions"] = g.get("assumptions"); out["events"] = g.get("events", []); out["correction_effect"] = g.get("correction_effect_on_physics_iou")
    return out
