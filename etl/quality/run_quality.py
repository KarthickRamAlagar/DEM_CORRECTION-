"""Run the data-quality checks and write data/processed/sdg/quality/report.json (read by the hidden monitoring route and the PDF).
Run from the repo root:  uv run python etl/quality/run_quality.py [--root .] [--max-tables 12] [--max-rasters 20]
Reads only. Writes one JSON file (and a schema baseline the first time). Nothing in data/final or model/saved is changed."""
from __future__ import annotations
import argparse, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import checks as C

SKIP = {".venv", "node_modules", ".git", "quality", "lineage", "__pycache__"}
def find(root: Path, base: str, pats: tuple[str, ...], limit: int):
    b = root / base
    if not b.exists(): return []
    out = []
    for pat in pats:
        out += [p for p in b.rglob(pat) if not (set(p.relative_to(root).parts) & SKIP)]
    return sorted(set(out))[:limit]


# The 29 inputs the production model uses (model/helpers/features_v2.py, F29_parity_safe). Sentinel-1 radar columns are excluded by design.
F29 = ["raw_z", "slope_deg", "aspect_sin", "aspect_cos", "tri", "tpi", "relative_slope_position", "planform_curvature", "profile_curvature", "general_curvature", "hillshade",
       "ndvi", "ndwi", "ndsi", "evi", "shadow_index", "bsi", "band_B02", "band_B03", "band_B04", "band_B08", "band_B11", "band_B12", "elev_mean_3x3", "elev_std_3x3",
       "slope_mean_5x5", "slope_std_5x5", "ndvi_mean_3x3", "terrain_region_class"]
RADAR = re.compile(r"^(vv|vh)(_|$)")
PRIMARY = "data/final/golden_dataset.parquet"   # the table the model and the app use; every headline number below is about THIS table


def _norm(p): return str(p).replace("\\", "/")


def layer1(items, primary=PRIMARY):
    tabs = [i for i in items if i["kind"] == "table"]; geos = [i for i in items if i["kind"] == "geometry" and i.get("features")]
    rasters = [i for i in items if i["kind"] == "raster" and i.get("crs") is not None or i["kind"] == "raster" and i.get("has_crs") is False]
    per_table = [{"file": _norm(t["file"]), "rows": t["rows"], "columns": t["columns"], "rows_with_every_column_filled": t.get("feature_completeness"),
                  "duplicate_rate": t.get("duplicate_rate"), "columns_over_5pct_missing": len(t.get("columns_over_5pct_missing") or [])} for t in tabs]
    pt = next((t for t in tabs if _norm(t["file"]) == primary), None)
    prim = None
    if pt:
        miss = pt.get("missing_fraction_by_column") or {}
        cols = set(pt["schema"]); present = [c for c in F29 if c in cols]
        fr = [miss.get(c, 0.0) or 0.0 for c in present]
        worst = max(present, key=lambda c: miss.get(c, 0.0) or 0.0) if present else None
        radar = {c: miss.get(c, 0.0) for c in sorted(cols) if RADAR.match(c)}
        prim = {"file": primary, "rows": pt["rows"], "columns": pt["columns"], "duplicate_rate": pt.get("duplicate_rate"),
                "rows_with_every_column_filled": pt.get("feature_completeness"),
                "model_inputs": {"expected": len(F29), "present": len(present), "absent_names": [c for c in F29 if c not in cols],
                                 "mean_filled_fraction": (1 - sum(fr) / len(fr)) if fr else None,
                                 "worst_column": worst, "worst_missing_fraction": (miss.get(worst, 0.0) if worst else None)},
                "excluded_by_design_radar": radar,
                "note": "Radar columns are left out of the model on purpose (about 88% empty). Judge model data by 'model_inputs', not by 'rows_with_every_column_filled'."}
    crs = sorted({r["crs"] for r in rasters if r.get("crs")})
    odd = sorted(_norm(r["file"]) for r in rasters if r.get("crs") and r["crs"] != "EPSG:4326")
    ngeo = sum(g["features"] for g in geos); invg = sum(g["invalid_geometry"] for g in geos if g.get("invalid_geometry") is not None)
    outl = [v for t in ([pt] if pt else tabs) for v in (t.get("outlier_rate_3iqr_sampled") or {}).values()]
    return {
        "primary_table": prim, "tables": per_table,
        "tables_checked": len(tabs), "rasters_checked": len([i for i in items if i["kind"] == "raster"]), "geometry_files_checked": len(geos),
        "invalid_geometry_rate": (invg / ngeo if ngeo and any(g.get("invalid_geometry") is not None for g in geos) else None),
        "crs_consistency": ({"consistent": len(crs) == 1, "distinct_crs": crs, "files_not_in_EPSG_4326": odd} if crs else None),
        "outlier_rate_mean_3iqr": (sum(outl) / len(outl) if outl else None),
        "note": "Headline numbers are for the primary table only. Rows are never added across different tables. A null means the check had nothing to run on; it is never replaced by a default.",
    }


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--root", default="."); ap.add_argument("--max-tables", type=int, default=12); ap.add_argument("--max-rasters", type=int, default=20); ap.add_argument("--max-geo", type=int, default=6)
    a = ap.parse_args(); root = Path(a.root).resolve()
    outdir = root / "data" / "processed" / "sdg" / "quality"; outdir.mkdir(parents=True, exist_ok=True)
    base_f = outdir / "schema_baseline.json"; baseline = json.loads(base_f.read_text()) if base_f.exists() else {}
    items, new_base = [], dict(baseline)
    for p in find(root, "data/final", ("*.parquet",), a.max_tables) + find(root, "data/processed/sdg", ("*.parquet",), a.max_tables):
        key = str(p.relative_to(root)); print("table  ", key)
        r = C.check_parquet(p, baseline_schema=baseline.get(key)); r["file"] = key; items.append(r); new_base.setdefault(key, r["schema"])
    for p in find(root, "data/final", ("*.tif",), a.max_rasters) + find(root, "data/processed/sdg", ("*.tif",), a.max_rasters):
        key = str(p.relative_to(root)); print("raster ", key); r = C.check_raster(p); r["file"] = key; items.append(r)
    for p in find(root, "data", ("*.geojson",), a.max_geo):
        key = str(p.relative_to(root)); print("geometry", key); r = C.check_geojson(p); r["file"] = key; items.append(r)
    base_f.write_text(json.dumps(new_base, indent=1), encoding="utf-8")
    rep = {"created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "root": str(root), "layer1_data_quality": layer1(items), "items": items,
           "limits": ["Outlier rates are estimated from a sample of up to 200,000 values per column.", "Duplicates are counted by location (and the first date column when there is one).", "The study box used for 'outside_study_box' is an information count, not an error."]}
    out = outdir / "report.json"; out.write_text(json.dumps(rep, indent=1, default=str), encoding="utf-8")
    print(f"\nWrote {out}\nSummary:", json.dumps(rep["layer1_data_quality"], indent=1))
    if not items: print("\nNothing was found to check. Run from the repo root, or pass --root.")

if __name__ == "__main__": main()
