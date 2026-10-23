"""Patch 14c: stricter physics check.  Same solver and same inputs as run_pilot.py, but it
  1. tests setup choices one at a time (variants): closed edges (as in the first pilot), open edges, open edges + a simple ground drainage loss;
  2. uses a shorter run before the satellite scene (--lead-days, default 3 instead of 10);
  3. scores against trivial baselines: "flood everything", "random cells, same flooded area", terrain what-if (same river rise and same flooded area);
  4. gives block-bootstrap ranges (the map is cut into blocks of cells and re-sampled) so a small gain is not mistaken for skill;
  5. records the flooded share and the overlap at several simulated times (snapshots), to see when over-flooding starts;
  6. keeps one small result file per run, so an interrupted run is resumed, not repeated.
It writes ONLY under data/processed/sdg/physics/sweep/ (and sweep/final).  It never changes the existing pipeline or the first pilot files.

Two roles, to keep the test honest (do not pick a setup on the same events you then score it on):
  --role tune   (default) try variants on some events; writes sweep_summary.json and a diagnostic gate that the app never reads; remembers the event names in tuned_events.json.
  --role final  ONE variant (--variant) on events that were NOT used to tune; writes physics_gate_v2.json, the only gate file the app reads.
Examples
  uv run python -I etl/physics/run_sweep.py --center 82.55,27.20 --channel data/processed/sdg/physics/channel.tif --events data/processed/sdg/physics/events.json --only event_2024-07-15
  uv run python -I etl/physics/run_sweep.py --role final --variant open_drain30 --center 82.55,27.20 --channel data/processed/sdg/physics/channel.tif --events data/processed/sdg/physics/events_unflagged.json"""
import argparse, json, math, re, sys, time
from pathlib import Path
from datetime import datetime, timedelta, timezone
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE))
import run_pilot as rp
from solver import Solver
OUT = rp.OUT / "sweep"
THRESH = 0.1      # m, a cell counts as flooded at this depth (same as the first pilot)

# ---------- variants ----------
def parse_variant(name):
    """closed | open | open_drain  or  open_drain<N> (N mm per day lost from every non-river cell: infiltration + local drainage, a sensitivity setting, not calibrated)."""
    m = re.fullmatch(r"(closed|open)(?:_drain(\d+)?)?", name)
    if not m: sys.exit(f"STOP: unknown variant {name!r}. Use closed, open, open_drain or open_drain<N> (for example open_drain30).")
    base, dr = m.group(1), m.group(2)
    drain = 0.0 if "_drain" not in name else float(dr) if dr else 30.0
    if base == "closed" and drain > 0: sys.exit("STOP: a closed-edge variant with drainage is not offered. Use open_drain<N>.")
    return {"edges": "NSEW" if base == "open" else "", "drain_mm_day": drain}

# ---------- scoring with baselines ----------
def matched_2d(hand, valid, k):
    m = np.zeros(valid.shape, bool)
    if k <= 0: return m
    hv = np.where(valid, hand, np.inf).ravel(); idx = np.argsort(hv, kind="stable")[:k]; m.ravel()[idx] = True
    return m & valid

def block_ids(shape, B):
    ny, nx = shape; nbx = (nx + B - 1) // B
    return ((np.arange(ny) // B)[:, None] * nbx + (np.arange(nx) // B)[None, :])

def block_boot(valid, truth, preds, B=10, n=300, seed=0):
    """Block bootstrap of IoU differences.  preds: dict name -> bool 2-D map (already inside valid).  Returns {'physics_minus_<name>': [low, high]} (2.5 and 97.5 percent)."""
    bid = block_ids(valid.shape, B); nb = int(bid.max()) + 1
    def counts(p):
        tp = np.bincount(bid[valid & truth & p], minlength=nb); fp = np.bincount(bid[valid & ~truth & p], minlength=nb); fn = np.bincount(bid[valid & truth & ~p], minlength=nb)
        return np.stack([tp, fp, fn]).astype(float)
    C = {k: counts(v) for k, v in preds.items()}; rng = np.random.default_rng(seed); idx = rng.integers(0, nb, (n, nb))
    def iou_s(c):
        s = c[:, idx].sum(axis=2); return s[0] / np.maximum(s.sum(axis=0), 1.0)
    ph = iou_s(C["physics"]); out = {}
    for k in preds:
        if k == "physics": continue
        d = ph - iou_s(C[k]); out[f"physics_minus_{k}"] = [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]
    return out

def score_full(depth, hand, rise_obs, truth, valid, B=10):
    base = rp.score(depth, hand, rise_obs, truth, valid)
    N = int(valid.sum()); T = int((truth & valid).sum()); k = base["physics"]["predicted_cells"]
    e_tp = k * T / max(N, 1); base["random_same_area"] = {"iou": float(e_tp / max(T + k - e_tp, 1e-9)), "predicted_cells": int(k)}
    base["all_wet"] = rp.iou(np.ones(N, bool), truth[valid]); base["wet_share_of_valid"] = float(k / max(N, 1))
    phys = (depth >= THRESH) & valid; same = (hand <= rise_obs) & valid; matched = matched_2d(hand, valid, int(phys.sum()))
    base["bootstrap"] = block_boot(valid, truth, {"physics": phys, "terrain_same_rise": same, "terrain_matched_area": matched, "all_wet": valid.copy()}, B=B)
    return base

# ---------- gate v2 ----------
def best_trivial(sc):
    return max(sc["terrain_whatif_matched_area"]["iou"], sc["all_wet"]["iou"], sc["random_same_area"]["iou"])

def gate_v2(results, variant, role, extra=None):
    """An event is won when, on the corrected DEM, the physics IoU is above ALL of: terrain what-if (same rise), terrain what-if (same area), flood-everything, random-same-area,
    and the block-bootstrap range of (physics minus terrain same area) and (physics minus flood-everything) lies above 0.  Pass: at least 3 events scored, at least two thirds won, mean gain over the best trivial baseline above 0."""
    rows = []
    for r in results:
        sc = (r.get("dem") or {}).get("corrected") or {}
        if "physics" not in sc: continue
        p = sc["physics"]["iou"]; bt = best_trivial(sc); bs = sc["bootstrap"]
        win = bool(p > sc["terrain_whatif_same_rise"]["iou"] and p > sc["terrain_whatif_matched_area"]["iou"] and p > sc["all_wet"]["iou"] and p > sc["random_same_area"]["iou"]
                   and bs["physics_minus_terrain_matched_area"][0] > 0 and bs["physics_minus_all_wet"][0] > 0)
        rows.append({"name": r["name"], "obs_date": r.get("obs_date"), "river_rise_at_obs_m": r.get("river_rise_at_obs_m"), "won": win, "physics_iou": p, "terrain_whatif_iou": sc["terrain_whatif_same_rise"]["iou"],
                     "terrain_whatif_same_area_iou": sc["terrain_whatif_matched_area"]["iou"], "flood_everything_iou": sc["all_wet"]["iou"], "random_same_area_iou": sc["random_same_area"]["iou"],
                     "gain_over_best_trivial": p - bt, "physics_wet_share": sc["wet_share_of_valid"], "observed_flood_share": sc["base_rate"],
                     "range_vs_terrain_same_area": sc["bootstrap"]["physics_minus_terrain_matched_area"], "range_vs_flood_everything": sc["bootstrap"]["physics_minus_all_wet"]})
    n = len(rows); wins = sum(r["won"] for r in rows); need = math.ceil(2 * n / 3) if n else 0; mg = float(np.mean([r["gain_over_best_trivial"] for r in rows])) if n else float("nan")
    passed = bool(n >= 3 and wins >= need and mg > 0)
    eff = [(r["dem"]["corrected"]["physics"]["iou"] - r["dem"]["raw"]["physics"]["iou"]) for r in results if "physics" in ((r.get("dem") or {}).get("corrected") or {}) and "physics" in ((r.get("dem") or {}).get("raw") or {})]
    g = {"passed": passed, "version": 2, "role": role, "variant": variant, "built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "label": "Pilot with a stricter check. A what-if with water movement over time, checked against satellite floods on a small window. Not a forecast.",
         "rule": "Passes only if at least 3 observed events were scored on the corrected DEM and, in at least two thirds of them, the physics model beats the terrain what-if (same river rise and same flooded area), "
                 "a flood-everything map and a random map of the same flooded area, with the bootstrap range of the gain above zero, and the mean gain over the best of these simple baselines is above zero.",
         "events_scored": n, "events_won": wins, "mean_gain_over_best_trivial": None if n == 0 else mg, "per_event": rows,
         "correction_effect_on_physics_iou": None if not eff else {"mean_corrected_minus_raw": float(np.mean(eff)), "per_event": [float(x) for x in eff]},
         "reason": None if passed else ("fewer than 3 scored events" if n < 3 else "the physics model did not beat the simple baselines by the rule")}
    if extra: g.update(extra)
    return g

# ---------- simulation ----------
def simulate(z, ch, dx, dy, stage, t_end, manning, dt_max, edges, drain_mm_day, snap_s, evaluate):
    s = Solver(z, dx, dy, n=manning, dt_max=dt_max, free_edges=tuple(edges)); s.set_forced_level(ch, z + stage(0.0))
    rate = drain_mm_day / 1000.0 / 86400.0; steps = 0; snaps = []; pend = [x for x in sorted(snap_s) if x < t_end - 1.0]
    while s.t < t_end - 1e-9:
        s.forced_eta = z + stage(s.t); dt = min(s._dt(), t_end - s.t); s.step(dt); steps += 1
        if rate > 0:
            loss = np.minimum(s.h, rate * dt); loss[ch] = 0.0; s.h -= loss; s.v_out += float(loss.sum() * dx * dy)
        while pend and s.t >= pend[0]: snaps.append(evaluate(s.h, pend.pop(0)))
    return s, steps, snaps

def prepare_event(ev, args, ch_fine, a_shape, tr, crs, lat):
    import pandas as pd
    obs_date = pd.Timestamp(ev["obs_date"]).normalize(); start = pd.Timestamp(ev.get("start") or (obs_date - timedelta(days=args.lead_days))).normalize()
    if ev.get("stage_csv"): days, q, rise, info = rp.stage_from_csv(ev["stage_csv"])
    else: days, q, rise, info = rp.stage_from_glofas(args.lon, args.lat, start.to_pydatetime(), obs_date.to_pydatetime())
    if np.isnan(rise).any(): return None
    t_days = np.array([(x - days[0]).days for x in days], float); stage = lambda t: float(np.interp(t / 86400.0, t_days, rise))
    t_obs = ((obs_date - days[0]).days + 0.5) * 86400.0; t_end = min(t_obs, (len(days) - 1) * 86400.0 + 43200.0)
    tru_f, tru_v = rp.observed_on_grid(ev["observed"], tr, a_shape, crs, args.coarsen)
    return {"obs_date": obs_date, "stage": stage, "t_obs": t_obs, "t_end": t_end, "info": info, "rise_obs": stage(t_obs), "peak": float(np.nanmax(rise)), "tru_f": tru_f, "tru_v": tru_v}

def signature(args, variant):
    return {"center": [args.lon, args.lat], "half_km": args.half_km, "coarsen": args.coarsen, "manning": args.manning, "dt_max": args.dt_max, "lead_days": args.lead_days, "variant": variant, "snap_hours": args.snap_hours}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--center", required=True); ap.add_argument("--half-km", type=float, default=12.0); ap.add_argument("--coarsen", type=int, default=3)
    ap.add_argument("--raw", default=str(rp.ROOT / "data/final/corrected_rasters/raw_dem_2022.tif")); ap.add_argument("--corrected", default=str(rp.ROOT / "data/final/corrected_rasters/corrected_dem_2022.tif"))
    ap.add_argument("--channel", required=True); ap.add_argument("--events", required=True); ap.add_argument("--manning", type=float, default=0.05); ap.add_argument("--dt-max", type=float, default=30.0)
    ap.add_argument("--role", choices=["tune", "final"], default="tune"); ap.add_argument("--variants", default="closed,open,open_drain30", help="tune role: comma list"); ap.add_argument("--variant", default="", help="final role: the one variant")
    ap.add_argument("--lead-days", type=float, default=3.0); ap.add_argument("--snap-hours", default="6,12,24,48,72"); ap.add_argument("--dems", choices=["corrected", "raw", "both"], default="")
    ap.add_argument("--only", default="", help="run only events whose name contains this text"); ap.add_argument("--redo", action="store_true"); ap.add_argument("--block", type=int, default=10, help="bootstrap block size in model cells")
    ap.add_argument("--plots", action="store_true"); ap.add_argument("--out", default=str(OUT)); args = ap.parse_args()
    args.lon, args.lat = [float(x) for x in args.center.split(",")]; out = Path(args.out); (out / "runs").mkdir(parents=True, exist_ok=True)
    args.lead_days = float(args.lead_days); args.snap_hours = ",".join(str(float(x)) for x in args.snap_hours.split(",") if x.strip()); snap_s = [float(x) * 3600.0 for x in args.snap_hours.split(",") if x.strip()]
    if args.role == "final":
        if not args.variant: sys.exit("STOP: --role final needs --variant (the one setup chosen on the tuning events).")
        variants = [args.variant]; dems_wanted = args.dems or "both"
    else: variants = [v.strip() for v in args.variants.split(",") if v.strip()]; dems_wanted = args.dems or "corrected"
    cfgs = {v: parse_variant(v) for v in variants}; dem_tags = ["raw", "corrected"] if dems_wanted == "both" else [dems_wanted]
    if "corrected" not in dem_tags and args.role == "final": sys.exit("STOP: the gate is scored on the corrected DEM.")
    events = json.loads(Path(args.events).read_text(encoding="utf-8"))
    if args.only: events = [e for e in events if args.only in e["name"]]
    if not events: sys.exit("STOP: no events to run.")
    tuned_f = out / "tuned_events.json"; tuned = json.loads(tuned_f.read_text()) if tuned_f.exists() else []
    if args.role == "final":
        clash = [e["name"] for e in events if e["name"] in tuned]
        if clash: sys.exit(f"STOP: these events were used to choose the setup and cannot be used for the final check: {clash}. Use a different event file (for example unflagged scenes).")
    print(f"role {args.role}; variants {variants}; DEMs {dem_tags}; lead {args.lead_days} days; window {args.half_km} km around {args.lon}, {args.lat}; coarsen x{args.coarsen}; {len(events)} events")
    zr, tr, crs = rp.read_window(args.raw, args.lon, args.lat, args.half_km); zc, tr2, _ = rp.read_window(args.corrected, args.lon, args.lat, args.half_km)
    if zr.shape != zc.shape or abs(tr.c - tr2.c) > 1e-9: sys.exit("STOP: raw and corrected DEM windows do not line up (different grids).")
    ch_fine = rp.channel_mask(args.channel, tr, zr.shape, crs)
    if ch_fine.sum() == 0: sys.exit("STOP: no river cells inside the window. Move the centre or check --channel.")
    dx, dy = rp.cell_size_m(tr, crs, args.lat); dx, dy = dx * args.coarsen, dy * args.coarsen; k = args.coarsen
    print(f"fine grid {zr.shape}; river cells {int(ch_fine.sum())}; model cell {dx:.0f} x {dy:.0f} m")
    from scipy import ndimage
    ch = rp.block(ch_fine.astype("float32"), k, "max") > 0; prepared = {}; per_variant = {v: [] for v in variants}; t_all = time.time()
    for ev in events:
        try: prep = prepare_event(ev, args, ch_fine, zr.shape, tr, crs, args.lat)
        except SystemExit as ex: print(f"  {ev['name']}: SKIPPED ({ex})"); continue
        if prep is None: print(f"  {ev['name']}: SKIPPED (river levels could not be derived)"); continue
        prepared[ev["name"]] = prep
        for v in variants:
            res = {"name": ev["name"], "obs_date": str(prep["obs_date"].date()), "river_rise_at_obs_m": round(prep["rise_obs"], 2), "peak_rise_m": round(prep["peak"], 2), "flow_info": prep["info"], "dem": {}}
            for tag, zf_in in (("raw", zr), ("corrected", zc)):
                if tag not in dem_tags: continue
                rf = out / "runs" / f"{ev['name']}__{tag}__{v}.json"; sig = signature(args, v)
                if rf.exists() and not args.redo:
                    old = json.loads(rf.read_text(encoding="utf-8"))
                    if old.get("signature") == sig: res["dem"][tag] = old["score"]; print(f"  {ev['name']} {tag} {v}: reused saved run"); continue
                z = rp.block(zf_in, k, "mean"); zmin = rp.block(zf_in, k, "min"); bad = ~np.isfinite(z); zf = np.where(bad, np.nanmax(z) + 50.0, z); zf = np.where(ch & ~bad, np.where(np.isfinite(zmin), zmin, zf), zf)
                idx = ndimage.distance_transform_edt(~ch, return_indices=True, return_distances=False); hand = zf - zf[idx[0], idx[1]]
                valid = (prep["tru_v"] >= 0.5) & ~bad & ~ndimage.binary_dilation(ch, iterations=1); truth = prep["tru_f"] >= 0.5
                if not truth[valid].any(): res["dem"][tag] = {"skipped": "no observed flood inside the valid window"}; continue
                def evaluate(h, t_s, valid=valid, truth=truth):
                    p = (h >= THRESH) & valid; tp = int((p & truth).sum()); un = int((p | (truth & valid)).sum())
                    return {"hours": round(t_s / 3600.0, 1), "wet_share_of_valid": float(p.sum() / max(valid.sum(), 1)), "iou_if_frozen_here": tp / max(un, 1)}
                t0 = time.time(); c = cfgs[v]
                s, steps, snaps = simulate(zf, ch, dx, dy, prep["stage"], prep["t_end"], args.manning, args.dt_max, c["edges"], c["drain_mm_day"], snap_s, evaluate)
                sc = score_full(s.h, hand, prep["rise_obs"], truth, valid, B=args.block)
                sc.update({"mass_error": float(s.mass_error()), "steps": steps, "seconds": round(time.time() - t0, 1), "snapshots": snaps, "variant": v, "settings": c})
                rf.write_text(json.dumps({"signature": sig, "score": sc}, indent=1), encoding="utf-8"); res["dem"][tag] = sc
                print(f"  {ev['name']} {tag} {v}: {steps} steps, {sc['seconds']} s, mass error {sc['mass_error']:.1e}; physics IoU {sc['physics']['iou']:.3f}, flood-everything {sc['all_wet']['iou']:.3f}, "
                      f"terrain same area {sc['terrain_whatif_matched_area']['iou']:.3f}, flooded share {sc['wet_share_of_valid']*100:.0f}% (observed {sc['base_rate']*100:.0f}%)", flush=True)
                if args.plots and tag == "corrected": rp.draw(out / "figs" / f"{ev['name']}_{tag}_{v}.png", f"{ev['name']} {tag} {v}", truth, valid, s.h >= THRESH, hand <= prep["rise_obs"], ch)
            per_variant[v].append(res)
    window = {"center_lon": args.lon, "center_lat": args.lat, "half_km": args.half_km, "model_cell_m": [round(dx), round(dy)]}
    summ = {}
    print("\nSUMMARY (corrected DEM)")
    for v in variants:
        g = gate_v2(per_variant[v], v, args.role); summ[v] = {"gate": g, "events": per_variant[v]}
        rows = g["per_event"]
        if rows: print(f"  {v:14s} events {g['events_scored']}  won {g['events_won']}  mean physics IoU {np.mean([r['physics_iou'] for r in rows]):.3f}  flood-everything {np.mean([r['flood_everything_iou'] for r in rows]):.3f}  "
                       f"terrain same area {np.mean([r['terrain_whatif_same_area_iou'] for r in rows]):.3f}  mean gain over best simple baseline {g['mean_gain_over_best_trivial']:+.3f}  flooded share {np.mean([r['physics_wet_share'] for r in rows])*100:.0f}%  -> {'PASS' if g['passed'] else 'not passed'}")
        else: print(f"  {v:14s} no scored events")
    assum = [f"River cells are held at a level that rises above the local ground by the planning-assumption rise for the day (GloFAS flow level to 0/1/2/4 m).", f"Manning n = {args.manning} everywhere.",
             f"The run starts {args.lead_days:g} days before the scene." + (f" Edges are open and {cfgs[variants[0]]['drain_mm_day']:g} mm per day is lost from every non-river cell (a sensitivity setting, not calibrated)." if args.role == "final" and cfgs[variants[0]]["drain_mm_day"] else (" Edges are open." if args.role == "final" and cfgs[variants[0]]["edges"] else "")),
             "No bridges, embankments, drains or rainfall are modelled.", "Satellite flood scenes are snapshots: the model is compared on the day of the scene."]
    if args.role == "tune":
        names = sorted(set(tuned) | {e["name"] for e in events}); tuned_f.write_text(json.dumps(names, indent=1), encoding="utf-8")
        (out / "sweep_summary.json").write_text(json.dumps({"built_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "window": window, "args": signature(args, ",".join(variants)), "note": "Diagnostic. Setups were compared on these same events, so no gate here is evidence of skill.", "variants": summ}, indent=1), encoding="utf-8")
        print(f"\nWrote {out/'sweep_summary.json'}. This is a diagnostic: the gate on the SAME events is not evidence. Pick one setup, then run --role final on different events.")
    else:
        g = summ[variants[0]]["gate"]; rows = []
        for e in g["per_event"]: rows.append({k2: e[k2] for k2 in ("name", "obs_date", "river_rise_at_obs_m", "physics_iou", "terrain_whatif_iou", "terrain_whatif_same_area_iou", "flood_everything_iou", "random_same_area_iou", "won")} | {"observed_flood_share": e["observed_flood_share"]})
        g.update({"window": window, "assumptions": assum, "events": rows}); (out / "final").mkdir(exist_ok=True)
        (out.parent / "physics_gate_v2.json").write_text(json.dumps(g, indent=1), encoding="utf-8"); (out / "final" / "final_result.json").write_text(json.dumps({"window": window, "events": per_variant[variants[0]], "gate": g}, indent=1), encoding="utf-8")
        print(f"\nGATE v2: {'PASSED' if g['passed'] else 'not passed'} - {g.get('reason') or ''} ({g['events_won']} of {g['events_scored']} events won)\nWrote {out.parent/'physics_gate_v2.json'}")
    print(f"Total time {(time.time()-t_all)/60:.1f} min")

if __name__ == "__main__": main()
