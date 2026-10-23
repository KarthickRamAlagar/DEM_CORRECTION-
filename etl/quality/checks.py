"""Data-quality checks (master prompt section 33, metric layer 1). Only pandas, pyarrow and numpy are required.
rasterio and shapely are used when installed; when they are not, that part of the report says so instead of guessing.
Memory use stays small: parquet files are read in batches."""
from __future__ import annotations
import json, math, re
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import pyarrow as pa

LAT_RE = re.compile(r"^(lat|latitude|y)$", re.I)
LON_RE = re.compile(r"^(lon|lng|long|longitude|x)$", re.I)
ELEV_RE = re.compile(r"(elev|height|dem|_z$|^z_|^z$|icesat|ref_h)", re.I)
DATE_RE = re.compile(r"(date|time|year)", re.I)
ELEV_MIN, ELEV_MAX = -500.0, 9000.0          # metres; outside this is not a land elevation on Earth
SAMPLE = 200_000                              # values per column kept for the outlier estimate
DUP_ROW_CAP = 5_000_000


def _none(v):
    return None if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) else v


def check_parquet(path: Path, study_box=(25.0, 28.0, 80.0, 84.0), baseline_schema: dict | None = None) -> dict:
    pf = pq.ParquetFile(path)
    schema = {f.name: str(f.type) for f in pf.schema_arrow}
    names = list(schema)
    num = [n for n, t in schema.items() if pa.types.is_floating(pf.schema_arrow.field(n).type) or pa.types.is_integer(pf.schema_arrow.field(n).type)]
    lat = next((n for n in names if LAT_RE.match(n)), None); lon = next((n for n in names if LON_RE.match(n)), None)
    date_cols = [n for n in names if DATE_RE.search(n)]
    elev_cols = [n for n in num if ELEV_RE.search(n) and n not in (lat, lon)]
    rows = pf.metadata.num_rows
    nulls = {n: 0 for n in names}; mins = {}; maxs = {}; samples = {n: [] for n in num}
    bad_lat = bad_lon = outside_box = nonfinite = 0
    elev_out = {n: 0 for n in elev_cols}
    keys = []
    rng = np.random.default_rng(42); keep = min(1.0, SAMPLE / max(1, rows))
    future = pre2000 = date_null = 0; now_year = datetime.now(timezone.utc).year
    complete_rows = 0
    for b in pf.iter_batches(batch_size=200_000):
        t = b.to_pandas()
        nn = t.notna()
        complete_rows += int(nn.all(axis=1).sum())
        for n in names:
            nulls[n] += int((~nn[n]).sum())
        for n in num:
            col = t[n].to_numpy(dtype="float64", na_value=np.nan) if t[n].dtype.kind in "fiu" else t[n].astype("float64").to_numpy()
            fin = np.isfinite(col); nonfinite += int((~fin & nn[n].to_numpy()).sum())
            if fin.any():
                mins[n] = min(mins.get(n, np.inf), float(col[fin].min())); maxs[n] = max(maxs.get(n, -np.inf), float(col[fin].max()))
                pick = col[fin][rng.random(int(fin.sum())) < keep]; samples[n].append(pick)
            if n in elev_out: elev_out[n] += int((fin & ((col < ELEV_MIN) | (col > ELEV_MAX))).sum())
        if lat and lon:
            la = t[lat].to_numpy(dtype="float64", na_value=np.nan); lo = t[lon].to_numpy(dtype="float64", na_value=np.nan)
            bad_lat += int(((la < -90) | (la > 90) | ~np.isfinite(la)).sum()); bad_lon += int(((lo < -180) | (lo > 180) | ~np.isfinite(lo)).sum())
            outside_box += int(((la < study_box[0]) | (la > study_box[1]) | (lo < study_box[2]) | (lo > study_box[3])).sum())
            if rows <= DUP_ROW_CAP:
                extra = [t[c].astype("string").fillna("").to_numpy() for c in date_cols[:1]]
                keys.append(np.rec.fromarrays([np.round(la, 7), np.round(lo, 7)] + extra))
        for c in date_cols:
            s = t[c]
            if s.dtype.kind in "iuf":
                y = s.dropna().astype("float64"); y = y[(y > 1900) & (y < 3000)]
                future += int((y > now_year).sum()); pre2000 += int((y < 2000).sum()); date_null += int(s.isna().sum())
            elif s.dtype.kind == "M" or str(s.dtype).startswith("datetime"):
                y = s.dt.year.dropna(); future += int((y > now_year).sum()); pre2000 += int((y < 2000).sum()); date_null += int(s.isna().sum())
    dup = None
    if keys:
        allk = np.concatenate(keys); dup = int(len(allk) - len(np.unique(allk)))
    outl = {}
    for n, parts in samples.items():
        if not parts: continue
        v = np.concatenate(parts)
        if v.size < 50: continue
        q1, q3 = np.percentile(v, [25, 75]); iqr = q3 - q1
        if iqr > 0: outl[n] = float(((v < q1 - 3 * iqr) | (v > q3 + 3 * iqr)).mean())
    miss = {n: nulls[n] / rows if rows else None for n in names}
    drift = None
    if baseline_schema is not None:
        drift = {"added": sorted(set(schema) - set(baseline_schema)), "removed": sorted(set(baseline_schema) - set(schema)),
                 "type_changed": sorted(n for n in schema if n in baseline_schema and schema[n] != baseline_schema[n])}
    return {
        "kind": "table", "file": str(path), "rows": rows, "columns": len(names), "schema": schema, "schema_drift": drift,
        "missing_fraction_by_column": {k: _none(v) for k, v in miss.items() if v},
        "worst_missing_column": (max(miss, key=miss.get) if rows and any(miss.values()) else None),
        "feature_completeness": (complete_rows / rows) if rows else None,
        "columns_over_5pct_missing": sorted(n for n, v in miss.items() if v and v > 0.05),
        "non_finite_numeric_values": nonfinite,
        "coordinates": ({"lat_col": lat, "lon_col": lon, "invalid_lat": bad_lat, "invalid_lon": bad_lon, "outside_study_box": outside_box, "study_box_s_n_w_e": list(study_box)} if lat and lon else None),
        "duplicate_rows_by_location": dup, "duplicate_rate": (dup / rows) if dup is not None and rows else None,
        "elevation_range_violations": ({k: v for k, v in elev_out.items()} if elev_out else None), "elevation_valid_range_m": [ELEV_MIN, ELEV_MAX],
        "outlier_rate_3iqr_sampled": outl or None, "outlier_sample_size_per_column": SAMPLE,
        "numeric_min": {k: _none(v) for k, v in mins.items()}, "numeric_max": {k: _none(v) for k, v in maxs.items()},
        "time": ({"columns": date_cols, "future_values": future, "before_2000": pre2000, "null_values": date_null} if date_cols else None),
    }


def check_raster(path: Path) -> dict:
    try:
        import rasterio
    except ImportError:
        return {"kind": "raster", "file": str(path), "status": "not checked: rasterio is not installed"}
    try:
        with rasterio.open(path) as r:
            scale = max(1, int(max(r.width, r.height) / 1024))
            a = r.read(1, out_shape=(max(1, r.height // scale), max(1, r.width // scale)), masked=True)
            data = np.ma.filled(a.astype("float64"), np.nan)
            fin = np.isfinite(data); valid = float(fin.mean()) if data.size else None
            out = {"kind": "raster", "file": str(path), "crs": (r.crs.to_string() if r.crs else None), "width": r.width, "height": r.height,
                   "bands": r.count, "dtype": r.dtypes[0], "nodata": r.nodata, "pixel_size": [abs(r.transform.a), abs(r.transform.e)],
                   "bounds": list(r.bounds), "valid_fraction_sampled": valid, "sample_decimation": scale,
                   "min": _none(float(np.nanmin(data))) if fin.any() else None, "max": _none(float(np.nanmax(data))) if fin.any() else None}
            out["has_crs"] = r.crs is not None; out["has_nodata"] = r.nodata is not None
            return out
    except Exception as e:  # a broken file is a finding, not a crash
        return {"kind": "raster", "file": str(path), "status": f"unreadable: {type(e).__name__}: {e}"[:300]}


def check_geojson(path: Path, max_mb: int = 300) -> dict:
    if path.stat().st_size > max_mb * 1e6:
        return {"kind": "geometry", "file": str(path), "status": f"skipped: larger than {max_mb} MB"}
    try:
        gj = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"kind": "geometry", "file": str(path), "status": f"unreadable: {type(e).__name__}"}
    feats = gj.get("features", []) if isinstance(gj, dict) else []
    try:
        from shapely.geometry import shape
        have_shapely = True
    except ImportError:
        have_shapely = False
    n = len(feats); invalid = empty = out_range = 0
    def coords(g):
        if isinstance(g, (list, tuple)):
            if g and isinstance(g[0], (int, float)): yield g
            else:
                for x in g: yield from coords(x)
    for f in feats:
        g = f.get("geometry")
        if not g: empty += 1; continue
        if any(not (-180 <= c[0] <= 180 and -90 <= c[1] <= 90) for c in coords(g.get("coordinates", []))): out_range += 1
        if have_shapely:
            try:
                s = shape(g)
                if s.is_empty: empty += 1
                elif not s.is_valid: invalid += 1
            except Exception: invalid += 1
    return {"kind": "geometry", "file": str(path), "features": n, "empty_geometry": empty,
            "invalid_geometry": (invalid if have_shapely else None), "invalid_geometry_rate": ((invalid / n) if have_shapely and n else None),
            "coordinates_outside_lonlat_range": out_range, "crs_assumed": "EPSG:4326 (GeoJSON standard)",
            "validity_check": ("shapely" if have_shapely else "not run: shapely is not installed (only coordinate ranges checked)")}
