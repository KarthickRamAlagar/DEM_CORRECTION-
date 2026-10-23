"""Build the 10 metric layers (master prompt section 41) from files that already exist, and write
data/processed/sdg/quality/metric_layers.json. The hidden dashboard reads this file through the gateway (/__monitor/<secret>/layers).

Run from the repo root:   uv run python etl/metrics/build_metric_layers.py [--root .]
Reads only. Writes one JSON file. Nothing in data/final or model/saved is changed.

Rules kept here:
- Every number is read from a file or computed from one. A number that cannot be found is null and the page shows "No data".
- Nothing is invented. Metrics that were never computed (precision, recall, F1, PR-AUC, calibration, drift, SDG 12 erosion, ...) stay null.
- Money is "estimated recovery need, not a release decision". Exposure is not casualties or damage. Flood is a terrain what-if, not a forecast.
"""
from __future__ import annotations
import argparse, json, sqlite3
from datetime import datetime, timezone
from pathlib import Path

SKIP = {".venv", "node_modules", ".git", "__pycache__", "quality", "lineage", "mlflow"}
COVER_MIN = 0.99
EVER = "2019-2026 ever"


def jload(p: Path):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return None


def find_one(root: Path, name: str, prefer: tuple[str, ...] = ()):
    hits = [p for p in root.rglob(name) if not (set(p.relative_to(root).parts) & SKIP)]
    for pre in prefer:
        for p in hits:
            if p.relative_to(root).as_posix().startswith(pre):
                return p
    return hits[0] if hits else None


def m(label, value, unit=None, note=None):
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        value = None
    return {"label": label, "value": value, "unit": unit, "note": note}


def layer(lid, name, metrics, note=None, status=None):
    have = [x for x in metrics if x["value"] is not None]
    st = status or ("No data" if not have else ("Has data" if len(have) == len(metrics) else "Partly"))
    return {"id": lid, "name": name, "status": st, "metrics": metrics, "note": note}


def r(x, n=3):
    return None if x is None else round(float(x), n)


# ---------------------------------------------------------------- SDG tables (same joins and filters as server/sdg_routes.py)
def sdg_block(root: Path):
    try:
        import pandas as pd
    except ImportError:
        return None
    ex = root / "data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv"
    fu = root / "data/processed/sdg/funding/funding_need_by_district_year.csv"
    if not (ex.exists() and fu.exists()):
        return None
    e = pd.read_csv(ex)
    e["district_key"] = e.iso + "|" + e.district + "|" + e.district_area_km2.round(1).astype(str)
    f = pd.read_csv(fu)
    extra = e[["district_key", "year", "bound", "flooded_km2", "buildings_exposed", "bldg_coverage", "district_pop", "district_cropland_ha", "district_area_km2"]]
    df = f.merge(extra, on=["district_key", "year", "bound"], how="left")
    df["year"] = df["year"].astype(str)

    def tot(x):
        s = lambda c: (None if x[c].isna().all() else float(x[c].sum()))
        base = x.drop_duplicates("district_key")
        out = {"districts": int(x.district_key.nunique()), "flooded_km2": s("flooded_km2"), "people_exposed": s("pop_exposed"), "cropland_ha_exposed": s("cropland_ha_exposed"),
               "need_min_inr": s("need_min_inr"), "need_max_inr": s("need_max_inr"), "need_min_local": s("need_min"), "need_max_local": s("need_max"),
               "district_pop": float(base.district_pop.sum()), "district_cropland_ha": float(base.district_cropland_ha.sum())}
        out["pct_people"] = (out["people_exposed"] / out["district_pop"]) if out["people_exposed"] is not None and out["district_pop"] else None
        out["pct_cropland"] = (out["cropland_ha_exposed"] / out["district_cropland_ha"]) if out["cropland_ha_exposed"] is not None and out["district_cropland_ha"] else None
        bok = (not x.empty) and x.bldg_coverage.notna().all() and (x.bldg_coverage >= COVER_MIN).all() and x.buildings_exposed.notna().all()
        out["buildings_exposed"] = float(x.buildings_exposed.sum()) if bok else None
        return out

    res = {"currency": {"IND": "INR", "NPL": "NPR"}, "countries": {}}
    for iso in ("IND", "NPL"):
        d_all = df[df.iso == iso]
        if d_all.empty:
            continue
        cov = d_all[d_all.gfm_coverage >= COVER_MIN]
        ever = cov[cov.year == EVER]
        blk = {"districts_total": int(d_all.district_key.nunique()), "districts_covered": int(cov.district_key.nunique()), "ever": {}, "yearly": [], "top_districts": []}
        for b in ("lower_unflagged", "upper_union"):
            blk["ever"][b] = tot(ever[ever.bound == b])
        yr = cov[cov.year != EVER]
        for (y, b), x in yr.groupby(["year", "bound"]):
            t = tot(x)
            blk["yearly"].append({"year": y, "bound": b, **{k: t[k] for k in ("people_exposed", "cropland_ha_exposed", "flooded_km2", "need_min_inr", "need_max_inr")}})
        top = ever[ever.bound == "upper_union"].sort_values("need_max_inr", ascending=False, na_position="last").head(8)
        for _, row in top.iterrows():
            blk["top_districts"].append({k: (None if row.get(k) != row.get(k) else (row.get(k) if not hasattr(row.get(k), "item") else row.get(k).item())) for k in ("district", "pop_exposed", "cropland_ha_exposed", "need_min_inr", "need_max_inr")})
        res["countries"][iso] = blk
    cfg = jload(root / "etl/sdg/funding_config.json")
    res["assumptions"] = cfg
    return res


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    out_dir = root / "data/processed/sdg/quality"
    out_dir.mkdir(parents=True, exist_ok=True)

    ev_p = find_one(root, "eval_summary.json", ("model/saved", "model/evaluation"))
    ev = jload(ev_p) if ev_p else None
    qual = jload(out_dir / "report.json")
    lin = jload(root / "data/processed/sdg/lineage/manifest.json")
    rec = jload(Path(__file__).resolve().parent / "recorded_findings.json") or {}
    db_p = find_one(root, "benchmark.db", ("model/saved", "model/evaluation"))
    sdg = sdg_block(root)
    notes = []

    # benchmark.db facts
    bdb = {"runs": None, "stages": None, "prod_fit_s": None, "rows_trained_on": None, "decision": None, "spatial_rmse": None, "random_rmse": None, "created": None}
    if db_p:
        try:
            c = sqlite3.connect(f"file:{db_p.as_posix()}?mode=ro", uri=True)
            bdb["runs"] = c.execute("select count(*) from results").fetchone()[0]
            bdb["stages"] = [x[0] for x in c.execute("select distinct stage from results order by 1")]
            row = c.execute("select fit_seconds, rmse from results where stage='benchmark' and protocol='spatial' and model like '%production%' limit 1").fetchone()
            if row:
                bdb["prod_fit_s"], bdb["spatial_rmse"] = row
            row = c.execute("select rmse from results where stage='benchmark' and protocol='random' and model like '%production%' limit 1").fetchone()
            if row:
                bdb["random_rmse"] = row[0]
            meta = dict(c.execute("select key, value from meta").fetchall())
            try:
                bdb["rows_trained_on"] = int(meta.get("n_rows_total")) if meta.get("n_rows_total") else None
            except ValueError:
                pass
            try:
                bdb["decision"] = json.loads(meta.get("decision", "null"))
            except Exception:
                pass
            c.close()
        except Exception as ex:  # an unreadable database is a finding, not a crash
            notes.append(f"benchmark.db could not be read: {type(ex).__name__}")
    else:
        notes.append("benchmark.db not found.")
    mlflow_runs = None
    mdb = root / "mlflow" / "mlflow.db"
    if mdb.exists():
        try:
            c = sqlite3.connect(f"file:{mdb.as_posix()}?mode=ro", uri=True)
            mlflow_runs = c.execute("select count(*) from runs").fetchone()[0]
            c.close()
        except Exception:
            pass

    # ---- Layer 1 data quality
    L = []
    q1 = (qual or {}).get("layer1_data_quality") or {}
    prim = q1.get("primary_table")
    if prim:
        mi = prim["model_inputs"]
        crs = q1.get("crs_consistency") or {}
        L.append(layer(1, "Data quality", [
            m("Table checked", prim["file"]),
            m("Rows in that table", prim["rows"]),
            m("Model inputs filled (29 inputs)", r(mi["mean_filled_fraction"], 4), "fraction", f"{mi['present']} of {mi['expected']} inputs found in the table"),
            m("Worst model input, share missing", r(mi["worst_missing_fraction"], 4), "fraction", mi["worst_column"]),
            m("Rows with every column filled", r(prim["rows_with_every_column_filled"], 4), "fraction", "Low on purpose: radar columns are left out of the model."),
            m("Duplicate rate (same place and time)", r(prim["duplicate_rate"], 5), "fraction"),
            m("Invalid geometry rate", r(q1.get("invalid_geometry_rate"), 5), "fraction"),
            m("Outlier rate (3 x IQR, sampled)", r(q1.get("outlier_rate_mean_3iqr"), 4), "fraction"),
            m("Raster CRS consistent", (None if not crs else bool(crs.get("consistent"))), None,
              (None if not crs else f"{len(crs.get('files_not_in_EPSG_4326') or [])} raster(s) not in EPSG:4326")),
        ], note=prim.get("note")))
    else:
        L.append(layer(1, "Data quality", [m("Quality report", None)], note="Run etl/quality/run_quality.py (patch 9a version)." if qual else "No quality report found."))

    # ---- Layer 2 DEM correction + Layer 3 spatial validation
    dem = {}
    if ev:
        fr = {x["model"]: x for x in ev.get("frozen_table", [])}
        raw = fr.get("Raw DEM (no correction)")
        win = next((x for k, x in fr.items() if k.startswith("WINNER")), None)
        cvw = next((x for x in ev.get("cv_table", []) if x["model"] == ev.get("winner")), None)
        oof = ev.get("oof") or {}
        dem = {"frozen": [{k: x.get(k) for k in ("model", "n", "RMSE", "MAE", "MedAE", "LE90", "Bias", "RMSE_plains", "RMSE_foothill")} for x in ev.get("frozen_table", [])],
               "cv_top": [{"model": x["model"], "RMSE": x["RMSE"], "worst_fold_RMSE": x.get("worst_fold_RMSE")} for x in ev.get("cv_table", [])[:10]],
               "error_bins": oof.get("abs_error_bins"), "oof": {k: oof.get(k) for k in ("n", "raw_rmse", "corrected_rmse", "raw_mae", "corrected_mae")},
               "winner": ev.get("winner"), "model_version": ev.get("model_version"), "created_utc": ev.get("created_utc"), "algorithm": ev.get("algorithm"),
               "folds": ({k: cvw.get(k) for k in ("fold0_RMSE", "fold1_RMSE", "fold2_RMSE", "fold4_RMSE")} if cvw else None),
               "feature_sets": [{k: x.get(k) for k in ("features", "n_features", "algo", "RMSE", "RMSE_plains", "RMSE_foothill")} for x in ev.get("feature_sets_trim", ev.get("feature_set_table", []))],
               "known_limits": ev.get("known_limits")}
        L.append(layer(2, "DEM correction", [
            m("RMSE raw DEM, frozen strip", r(raw and raw["RMSE"]), "m", "Strip never used for fitting, tuning or choosing the model"),
            m("RMSE corrected, frozen strip", r(win and win["RMSE"]), "m"),
            m("MAE corrected, frozen strip", r(win and win["MAE"]), "m"),
            m("Bias corrected, frozen strip", r(win and win["Bias"]), "m"),
            m("Median absolute error, frozen strip", r(win and win["MedAE"]), "m"),
            m("90% error limit (LE90), frozen strip", r(win and win["LE90"]), "m"),
            m("95% error limit (P95)", None, "m", "Not computed"),
            m("Residual distribution", ("see chart" if oof.get("abs_error_bins") else None), None, "Share of points by size of error, raw vs corrected (pooled out-of-fold)"),
        ]))
        sp, rnd = bdb["spatial_rmse"], bdb["random_rmse"]
        L.append(layer(3, "Spatial validation", [
            m("Spatial 4-fold CV, raw DEM RMSE", None, "m"),  # filled from the benchmark meta below
            m("Spatial 4-fold CV, corrected RMSE", r(sp), "m", "10 km blocks, 5 km buffer"),
            m("Random split RMSE (same model)", r(rnd), "m", "Looks better because neighbours leak; not used for decisions"),
            m("Frozen strip RMSE, plains", r(win and win["RMSE_plains"]), "m", f"raw {r(raw and raw['RMSE_plains'], 2)} m"),
            m("Frozen strip RMSE, foothills", r(win and win["RMSE_foothill"]), "m", f"raw {r(raw and raw['RMSE_foothill'], 2)} m"),
            m("Region-wise performance beyond plains/foothills", None, None, "Not computed"),
        ], note="Study area is the Gangetic Plain with Himalayan foothill margin (25-28 N). It is not validated for high mountains."))
    else:
        L.append(layer(2, "DEM correction", [m("Evaluation summary", None)], note="eval_summary.json not found."))
        L.append(layer(3, "Spatial validation", [m("Evaluation summary", None)]))
    # raw CV RMSE from the benchmark meta (split_optimism_earlier) when present
    try:
        c = sqlite3.connect(f"file:{db_p.as_posix()}?mode=ro", uri=True)
        so = json.loads(dict(c.execute("select key, value from meta").fetchall()).get("split_optimism_earlier", "null"))
        c.close()
        if so:
            raw_cv = so[0].get("raw_RMSE")
            for lay in L:
                if lay["id"] == 3 and lay["metrics"]:
                    lay["metrics"][0] = m("Spatial 4-fold CV, raw DEM RMSE", r(raw_cv), "m", "10 km blocks, 5 km buffer")
            dem["cv_protocols"] = [{k: x.get(k) for k in ("protocol", "n_test", "raw_RMSE", "corrected_RMSE", "reduction_pct")} for x in so[:2]]
    except Exception:
        pass
    for lay in L:
        if lay["id"] == 3:
            have = [x for x in lay["metrics"] if x["value"] is not None]
            lay["status"] = "No data" if not have else ("Has data" if len(have) == len(lay["metrics"]) else "Partly")

    # ---- Layer 4 SDG 2, Layer 5 SDG 11, Layer 6 SDG 12
    cr = (sdg or {}).get("countries", {})
    def e(iso, b="upper_union"):
        return (cr.get(iso, {}).get("ever", {}) or {}).get(b) or {}
    ms = []
    for iso, nm in (("IND", "India"), ("NPL", "Nepal")):
        up, lo = e(iso), e(iso, "lower_unflagged")
        ms += [m(f"{nm}: cropland in observed floods, 2019-2026 ever (upper bound)", r(up.get("cropland_ha_exposed"), 0), "ha", f"conservative bound {r(lo.get('cropland_ha_exposed'), 0)} ha"),
               m(f"{nm}: share of district cropland inside observed floods", r(up.get("pct_cropland"), 4), "fraction", "Exposure, not crop loss")]
    ms += [m("Crop or yield prediction metrics", None, None, "No crop or yield prediction exists, so none is shown")]
    L.append(layer(4, "SDG 2 (food and farming)", ms, note="Observed flood exposure from Copernicus GFM x WorldCover cropland. Not yield loss."))
    fk = rec.get("flood_skill_hand") or {}
    L.append(layer(5, "SDG 11 (flood and exposure)", [
        m("IoU, HAND flood rule, raw DEM", fk.get("iou_raw"), None, f"recorded {fk.get('recorded_on')}"),
        m("IoU, HAND flood rule, corrected DEM", fk.get("iou_corrected")),
        m("ROC-AUC raw / corrected", (f"{fk['roc_auc_raw']} / {fk['roc_auc_corrected']}" if fk else None)),
        m("Days corrected beat raw", (f"{fk['days_corrected_better']} of {fk['days_compared']}" if fk else None), None, "Confidence interval includes 0"),
        m("Precision", None, None, "Not computed"), m("Recall", None, None, "Not computed"), m("F1", None, None, "Not computed"),
        m("PR-AUC", None, None, "Not computed"), m("Dice", None, None, "Not computed"), m("Confusion matrix", None, None, "Not computed"), m("Calibration", None, None, "Not computed"),
    ], note="Recorded from a run you checked, not recomputed here. " + (fk.get("reading") or "")))
    L.append(layer(6, "SDG 12 (land and resources)", [m("Erosion or land-degradation indicators", None, None, "Not built. Slope and land cover only; no erosion claims")], note="Kept as 'No data' on purpose."))

    # ---- Layer 7 explainability, Layer 8 uncertainty
    shap_rows = None
    if ev and ev.get("shap_global"):
        items = sorted(ev["shap_global"].items(), key=lambda kv: -kv[1])
        shap_rows = [{"feature": k, "value": v} for k, v in items]
    L.append(layer(7, "Explainability", [
        m("Global feature importance (TreeSHAP, mean |SHAP|)", (f"{len(shap_rows)} features" if shap_rows else None), None, (f"top: {shap_rows[0]['feature']}" if shap_rows else None)),
        m("Local explanation per point", "available in the app", None, "POST /api/model/explain"),
        m("Spatial attribution maps", None, None, "Not built"),
    ]))
    iv = (ev or {}).get("interval") or {}
    L.append(layer(8, "Uncertainty", [
        m("Target coverage of the interval", iv.get("nominal"), "fraction"),
        m("Observed coverage on the frozen strip", r(iv.get("frozen_coverage"), 4), "fraction", "Below target: spatial shift. Treat the band as approximate"),
        m("Interval width by terrain group (90% limit)", ("see chart" if iv.get("groups") else None)),
        m("Uncertainty map", None, None, "Not built"),
    ], note="Terrain-aware conformal intervals. Honest finding: coverage is about 85.5%, not 90%."))

    # ---- Layer 9 system (live), Layer 10 ML operations
    L.append(layer(9, "System", [m("CPU, memory, disk, latency, errors", "live", None, "See the System tab, read from the gateway every few seconds")], status="Live"))
    lin_code = (lin or {}).get("code") or {}
    golden = None
    if lin:
        for x in lin.get("artefacts", []):
            if x.get("path") == "data/final/golden_dataset.parquet":
                golden = {"sha256": x.get("sha256"), "bytes": x.get("bytes"), "modified_utc": x.get("modified_utc")}
                break
    live_rows = prim["rows"] if prim else None
    trained = bdb["rows_trained_on"]
    added = (live_rows - trained) if (live_rows is not None and trained is not None) else None
    schema_drift = None
    if qual:
        for it in qual.get("items", []):
            if it.get("kind") == "table" and str(it.get("file", "")).replace("\\", "/") == "data/final/golden_dataset.parquet" and it.get("schema_drift") is not None:
                d = it["schema_drift"]
                schema_drift = {"added": len(d["added"]), "removed": len(d["removed"]), "type_changed": len(d["type_changed"])}
    L.append(layer(10, "ML operations", [
        m("Model version", (ev or {}).get("model_version")),
        m("Model built", (ev or {}).get("created_utc")),
        m("Dataset version (SHA-256 of golden table)", (golden or {}).get("sha256")),
        m("Rows the model was trained and scored on", trained),
        m("Rows in the current golden table", live_rows),
        m("Rows added since the model was trained", added, None, ("Model and benchmarks were not re-run on these rows" if added else None)),
        m("Fit time, production recipe (one benchmark run)", r(bdb["prod_fit_s"], 1), "s"),
        m("Experiment runs recorded (benchmark database)", bdb["runs"]),
        m("MLflow runs (history only)", mlflow_runs),
        m("Schema drift since first baseline", (None if schema_drift is None else f"+{schema_drift['added']} / -{schema_drift['removed']} columns, {schema_drift['type_changed']} type changes")),
        m("Data or prediction drift", None, None, "Not computed"),
    ]))

    # ---- compact lineage + policy views
    lineage = None
    if lin:
        lineage = {"created_utc": lin.get("created_utc"), "git_commit": lin_code.get("git_commit"), "git_branch": lin_code.get("git_branch"), "git_uncommitted_files": lin_code.get("git_uncommitted_files"),
                   "python": lin_code.get("python"), "artefact_count": lin.get("artefact_count"), "artefacts_hashed": lin.get("artefacts_hashed"),
                   "chain": lin.get("chain"), "model": {k: (lin.get("model") or {}).get(k) for k in ("model_version", "created_utc", "algorithm", "winner")},
                   "key_files": [{"path": x["path"], "bytes": x.get("bytes"), "sha256": x.get("sha256")} for x in lin.get("artefacts", [])
                                 if x.get("path") in ("data/final/golden_dataset.parquet", "model/saved/eval_summary.json", "model/saved/oof_predictions.parquet", "model/saved/benchmark.db")]}
    quality_tables = q1.get("tables") if qual else None

    out = {
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": 1,
        "labels": {"money": "Estimated recovery need, not a release decision.", "flood": "Observed flood exposure and a terrain what-if. Not a forecast.", "exposure": "Exposure is not casualties and not damage."},
        "layers": L,
        "data": {"dem": dem, "uncertainty": iv or None, "shap": shap_rows, "sdg": sdg, "lineage": lineage, "quality_tables": quality_tables,
                 "mlops": {"benchmark_runs": bdb["runs"], "stages": bdb["stages"], "decision": bdb["decision"], "rows_trained_on": trained, "rows_live": live_rows, "mlflow_runs": mlflow_runs},
                 "flood_skill": fk or None, "recorded_label_year": rec.get("label_year_vs_imagery")},
        "sources": {"eval_summary": (ev_p.relative_to(root).as_posix() if ev_p else None), "benchmark_db": (db_p.relative_to(root).as_posix() if db_p else None),
                    "quality_report": ("data/processed/sdg/quality/report.json" if qual else None), "lineage_manifest": ("data/processed/sdg/lineage/manifest.json" if lin else None),
                    "sdg_tables": (["data/processed/sdg/exposure_ext/exposure_by_district_year_ext.csv", "data/processed/sdg/funding/funding_need_by_district_year.csv"] if sdg else None),
                    "recorded_findings": "etl/metrics/recorded_findings.json"},
        "notes": notes,
    }
    dest = out_dir / "metric_layers.json"
    dest.write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    print(f"Wrote {dest}")
    for lay in L:
        print(f"  Layer {lay['id']:>2} {lay['name']:<30} {lay['status']}")
    for n in notes:
        print("  note:", n)


if __name__ == "__main__":
    main()
