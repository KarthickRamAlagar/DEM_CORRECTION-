"""Patch 22 (D2, D3): roads, bridges, schools, health facilities and shelters from the OSM files you already downloaded,
each given its height above the nearest river (HAND, raw and corrected DEM). Writes ONLY to data/processed/sdg/assets/.
Reads: data/external/osm/osm_*.json (Overpass, with geometry) and data/processed/sdg/hand/hand_{raw,corrected}_2022.tif.
OSM is volunteer-mapped and incomplete, so every count made from these tables is a minimum. Roads are only motorway..tertiary (that is what was downloaded).
Run from the repo root:  uv run python -I etl/sdg/osm_assets.py"""
import glob, json, math, os, sys, time
from pathlib import Path
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(os.environ.get("DEM_ROOT") or Path(__file__).resolve().parents[2])
OSM = ROOT / "data/external/osm"
HANDP = {"raw": ROOT / "data/processed/sdg/hand/hand_raw_2022.tif", "corrected": ROOT / "data/processed/sdg/hand/hand_corrected_2022.tif"}
OUT = ROOT / "data/processed/sdg/assets"
BOX = (81.9, 25.4, 84.0, 28.0)          # west, south, east, north: the river-height layer
STEP_M = 100.0                          # one road sample per ~100 m
MAIN = {"motorway", "trunk", "primary", "secondary", "tertiary"}
KIND = {"school": "school", "college": "school", "university": "school", "hospital": "health", "clinic": "health", "shelter": "shelter"}
M_PER_DEG = 111195.0


def inbox(lat, lon):
    return BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]


def sample_hand(path, lats, lons):
    """HAND value at each point (NaN outside the raster or where there is no value). Reads each 1024 x 1024 block once."""
    lats, lons = np.asarray(lats, float), np.asarray(lons, float)
    out = np.full(len(lats), np.nan, dtype="float32")
    with rasterio.open(path) as s:
        T = s.transform
        col = np.floor((lons - T.c) / T.a).astype(np.int64)
        row = np.floor((lats - T.f) / T.e).astype(np.int64)
        ok = (col >= 0) & (col < s.width) & (row >= 0) & (row < s.height)
        idx = np.where(ok)[0]
        if len(idx) == 0:
            return out
        blk = 1024
        key = (row[idx] // blk) * 1_000_000 + (col[idx] // blk)
        order = np.argsort(key, kind="stable")
        idx, key = idx[order], key[order]
        starts = np.flatnonzero(np.r_[True, key[1:] != key[:-1]])
        ends = np.r_[starts[1:], len(key)]
        for a, b in zip(starts, ends):
            ii = idx[a:b]
            r0, r1, c0, c1 = row[ii].min(), row[ii].max() + 1, col[ii].min(), col[ii].max() + 1
            win = s.read(1, window=Window(int(c0), int(r0), int(c1 - c0), int(r1 - r0)))
            v = win[row[ii] - r0, col[ii] - c0].astype("float32")
            v[(v <= -9990) | ~np.isfinite(v)] = np.nan
            out[ii] = v
    return out


def load_osm():
    files = sorted(glob.glob(str(OSM / "osm_*.json")))
    if not files:
        sys.exit(f"STOP: no osm_*.json files in {OSM}. Nothing written.")
    seen, els = set(), []
    for p in files:
        for e in json.load(open(p, encoding="utf-8")).get("elements", []):
            k = (e.get("type"), e.get("id"))
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
    print(f"OSM files: {len(files)} | unique elements: {len(els):,}")
    return els


def line_samples(geom):
    """Samples every ~STEP_M along a line. Returns lat[], lon[], seg_m (metres each sample stands for), total length m."""
    la = np.array([q["lat"] for q in geom], float)
    lo = np.array([q["lon"] for q in geom], float)
    dy = np.diff(la) * M_PER_DEG
    dx = np.diff(lo) * M_PER_DEG * np.cos(np.radians((la[:-1] + la[1:]) / 2))
    seg = np.hypot(dx, dy)
    cum = np.r_[0.0, np.cumsum(seg)]
    L = float(cum[-1])
    if L <= 0:
        return None
    n = max(1, int(round(L / STEP_M)))
    pos = (np.arange(n) + 0.5) * L / n
    return np.interp(pos, cum, la), np.interp(pos, cum, lo), L / n, L


def main():
    t0 = time.time()
    for k, p in HANDP.items():
        if not p.exists():
            sys.exit(f"STOP: {p} not found. Nothing written.")
    els = load_osm()
    pts, roads, bridges = [], [], []
    for e in els:
        t = e.get("tags") or {}
        et = e.get("type")
        am = t.get("amenity")
        if am in KIND:
            if et == "node" and "lat" in e:
                la, lo = e["lat"], e["lon"]
            elif et == "way" and e.get("geometry"):
                la = float(np.mean([q["lat"] for q in e["geometry"]])); lo = float(np.mean([q["lon"] for q in e["geometry"]]))
            else:
                continue
            if inbox(la, lo):
                pts.append({"osm_id": f"{et[0]}{e['id']}", "kind": KIND[am], "amenity": am, "name": (t.get("name") or t.get("name:en") or "").strip(), "lat": la, "lon": lo})
        hw = t.get("highway")
        if et == "way" and hw and e.get("geometry") and len(e["geometry"]) >= 2:
            s = line_samples(e["geometry"])
            if s is None:
                continue
            la, lo, seg_m, L = s
            keep = np.array([inbox(a, b) for a, b in zip(la, lo)])
            is_bridge = t.get("bridge") not in (None, "no")
            if hw in MAIN and keep.any():
                roads.append(pd.DataFrame({"way_id": e["id"], "cls": hw, "lat": la[keep], "lon": lo[keep], "seg_m": seg_m, "bridge": is_bridge}))
            if is_bridge and hw in MAIN:  # patch 22b: main-road bridges only (footpath and village bridges are not relief-critical and inflated the count)
                g = e["geometry"]
                a, b = g[0], g[-1]
                mid = len(la) // 2
                if inbox(la[mid], lo[mid]):
                    bridges.append({"way_id": e["id"], "cls": hw, "name": (t.get("name") or "").strip(), "length_m": L, "lat": float(la[mid]), "lon": float(lo[mid]),
                                    "lat_a": a["lat"], "lon_a": a["lon"], "lat_b": b["lat"], "lon_b": b["lon"]})
    P = pd.DataFrame(pts)
    R = pd.concat(roads, ignore_index=True) if roads else pd.DataFrame(columns=["way_id", "cls", "lat", "lon", "seg_m", "bridge"])
    B = pd.DataFrame(bridges)
    print(f"parsed: facilities {len(P):,} | road samples {len(R):,} | bridges {len(B):,}  ({time.time()-t0:.0f} s)")
    if P.empty and R.empty and B.empty:
        sys.exit("STOP: nothing found inside the box. Nothing written.")
    for k, p in HANDP.items():
        col = "hand_raw" if k == "raw" else "hand_corrected"
        if len(P): P[col] = sample_hand(p, P.lat, P.lon)
        if len(R): R[col] = sample_hand(p, R.lat, R.lon)
        if len(B):
            sfx = "raw" if k == "raw" else "corrected"
            for end in ("a", "b"):
                B[f"hand_{end}_{sfx}"] = sample_hand(p, B[f"lat_{end}"], B[f"lon_{end}"])
        print(f"HAND {k} sampled ({time.time()-t0:.0f} s)")
    OUT.mkdir(parents=True, exist_ok=True)
    fmt = dict(index=False, float_format="%.5f")
    P.round({"hand_raw": 2, "hand_corrected": 2}).to_csv(OUT / "points.csv", **fmt) if len(P) else None
    R.round({"hand_raw": 2, "hand_corrected": 2, "seg_m": 1}).to_csv(OUT / "road_samples.csv", **fmt)
    B.to_csv(OUT / "bridges.csv", **fmt)
    (OUT / "meta.json").write_text(json.dumps({"built": time.strftime("%Y-%m-%d %H:%M"), "box": BOX, "step_m": STEP_M, "main_classes": sorted(MAIN),
        "source": "OpenStreetMap contributors via Overpass (data/external/osm). Volunteer-mapped, incomplete: counts are minimums.",
        "facilities": int(len(P)), "road_samples": int(len(R)), "bridges": int(len(B))}, indent=1), encoding="utf-8")
    print("\nSummary")
    if len(P):
        g = P.groupby("kind").agg(n=("osm_id", "size"), named=("name", lambda s: int((s != "").sum())), with_river_height=("hand_corrected", lambda s: int(s.notna().sum())))
        print(g.to_string())
    if len(R):
        km = R.groupby("cls").seg_m.sum() / 1000.0
        has = R[R.hand_corrected.notna()].groupby("cls").seg_m.sum() / 1000.0
        print("\nMain road length in the box (km) and the part with a river-height value:")
        print(pd.DataFrame({"km": km.round(0), "km_with_river_height": has.reindex(km.index).fillna(0).round(0)}).to_string())
    if len(B):
        print(f"\nBridges: {len(B):,}; with a river-height value at an end (corrected): {int(B[['hand_a_corrected','hand_b_corrected']].notna().any(axis=1).sum()):,}")
    print(f"\nWrote {OUT}  ({time.time()-t0:.0f} s). Next: restart the API and open the flow, step 3.")


if __name__ == "__main__":
    main()
