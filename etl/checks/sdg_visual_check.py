"""Patch 22 (D4): look at the flood what-if layer with your own eyes. Draws PNG pictures to outputs/sdg_visual_check/.
Each picture: flooded land (height above the nearest river <= chosen rise, corrected DEM) over the OSM rivers, with district
boundaries, main roads and schools / health facilities. A second picture per place shows what the correction changed (raw vs corrected).
Reads only. Run from the repo root:  uv run python -I etl/checks/sdg_visual_check.py [rise_m]
"""
import glob, json, os, sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import rasterio
from rasterio.windows import from_bounds

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(os.environ.get("DEM_ROOT") or Path(__file__).resolve().parents[2])
SDG = ROOT / "data/processed/sdg"
HAND = {"raw": SDG / "hand/hand_raw_2022.tif", "corrected": SDG / "hand/hand_corrected_2022.tif"}
GJ = SDG / "districts_ext/districts_ext.geojson"
ASSETS = SDG / "assets"
OUT = ROOT / "outputs/sdg_visual_check"
RISE = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
SITES = [("Siddharthnagar", 27.2322, 82.5457, 0.35), ("Basti", 26.9546, 82.8504, 0.35), ("Gonda", 27.1327, 81.9619, 0.35),
         ("Nepal Terai near Bhairahawa", 27.5, 83.45, 0.35), ("Overview of the whole river-height box", 26.7, 82.95, 1.3)]
BOX = (81.9, 25.4, 84.0, 28.0)
WATER, DRY = "#2b8cbe", "#f2efe6"


def read_window(path, w, s, e, n, max_px=1400):
    w, s, e, n = max(w, BOX[0]), max(s, BOX[1]), min(e, BOX[2]), min(n, BOX[3])
    with rasterio.open(path) as ds:
        win = from_bounds(w, s, e, n, ds.transform)
        scale = max(1, int(max(win.width, win.height) // max_px) + 1)
        a = ds.read(1, window=win, out_shape=(max(1, int(win.height // scale)), max(1, int(win.width // scale))), resampling=rasterio.enums.Resampling.nearest, boundless=True, fill_value=np.nan)
    a = a.astype("float32"); a[(a <= -9990) | ~np.isfinite(a)] = np.nan
    return a, (w, e, s, n)


def rivers(w, s, e, n):
    lines = []
    for p in glob.glob(str(ROOT / "data/external/osm/osm_*.json")):
        try:
            for el in json.load(open(p, encoding="utf-8")).get("elements", []):
                if el.get("type") == "way" and (el.get("tags") or {}).get("waterway") in ("river", "stream", "canal") and el.get("geometry"):
                    xs = [q["lon"] for q in el["geometry"]]; ys = [q["lat"] for q in el["geometry"]]
                    if max(xs) >= w and min(xs) <= e and max(ys) >= s and min(ys) <= n:
                        lines.append((xs, ys, el["tags"]["waterway"]))
        except Exception as ex:
            print("  river file skipped:", p, ex)
    return lines


def boundaries():
    if not GJ.exists():
        return []
    rings = []
    for f in json.load(open(GJ, encoding="utf-8")).get("features", []):
        g = f.get("geometry") or {}
        polys = g.get("coordinates", []) if g.get("type") == "MultiPolygon" else [g.get("coordinates", [])] if g.get("type") == "Polygon" else []
        for poly in polys:
            for ring in poly[:1]:
                rings.append(np.array(ring)[:, :2])
    return rings


def main():
    for k, p in HAND.items():
        if not p.exists():
            sys.exit(f"STOP: {p} not found.")
    OUT.mkdir(parents=True, exist_ok=True)
    B = boundaries(); print(f"district rings: {len(B)}")
    import pandas as pd
    R = pd.read_csv(ASSETS / "road_samples.csv") if (ASSETS / "road_samples.csv").exists() else None
    P = pd.read_csv(ASSETS / "points.csv") if (ASSETS / "points.csv").exists() else None
    lines_all = None
    for name, lat, lon, h in SITES:
        w, s, e, n = lon - h, lat - h, lon + h, lat + h
        raw, ext = read_window(HAND["raw"], w, s, e, n); cor, _ = read_window(HAND["corrected"], w, s, e, n)
        fr, fc = raw <= RISE, cor <= RISE
        fr &= np.isfinite(raw); fc &= np.isfinite(cor)
        if lines_all is None: lines_all = rivers(*BOX)
        big = h > 1
        fig, ax = plt.subplots(1, 2, figsize=(15, 7.4), dpi=110)
        for a_, mask, ttl in ((ax[0], fc, f"Flooded land if the river rises {RISE:g} m (corrected DEM)"), (ax[1], None, "What the correction changed")):
            a_.set_xlim(ext[0], ext[1]); a_.set_ylim(ext[2], ext[3]); a_.set_aspect(1 / np.cos(np.radians(lat))); a_.set_title(ttl, fontsize=11)
            if mask is not None:
                a_.imshow(np.where(mask, 1, 0), extent=ext, origin="upper", cmap=ListedColormap([DRY, WATER]), vmin=0, vmax=1, interpolation="nearest")
            else:
                cat = np.zeros(fc.shape, int); cat[fr & fc] = 1; cat[fr & ~fc] = 2; cat[~fr & fc] = 3
                a_.imshow(cat, extent=ext, origin="upper", cmap=ListedColormap([DRY, "#9ecae1", "#d95f02", "#1b7837"]), vmin=0, vmax=3, interpolation="nearest")
                a_.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for c in ("#9ecae1", "#d95f02", "#1b7837")], labels=["flooded in both", "flooded only in raw DEM", "flooded only after correction"], loc="lower left", fontsize=8, framealpha=.9)
            for xs, ys, kind in lines_all:
                if max(xs) >= ext[0] and min(xs) <= ext[1] and max(ys) >= ext[2] and min(ys) <= ext[3]:
                    a_.plot(xs, ys, color="#08306b", lw=0.9 if kind == "river" else 0.4, alpha=.9)
            for ring in B:
                if ring[:, 0].max() >= ext[0] and ring[:, 0].min() <= ext[1] and ring[:, 1].max() >= ext[2] and ring[:, 1].min() <= ext[3]:
                    a_.plot(ring[:, 0], ring[:, 1], color="#cb181d", lw=1.0)
            if R is not None and not big:
                r = R[(R.lon.between(ext[0], ext[1])) & (R.lat.between(ext[2], ext[3]))]
                a_.scatter(r.lon, r.lat, s=1.2, c="#444", alpha=.55, linewidths=0)
            if P is not None and not big:
                p = P[(P.lon.between(ext[0], ext[1])) & (P.lat.between(ext[2], ext[3]))]
                for kind, col, mk in (("school", "#e6ab02", "^"), ("health", "#e7298a", "P")):
                    q = p[p.kind == kind]; a_.scatter(q.lon, q.lat, s=26, c=col, marker=mk, edgecolors="k", linewidths=.4, zorder=5, label=kind)
            a_.plot([lon], [lat], marker="*", ms=14, mfc="yellow", mec="k", zorder=6)
            a_.tick_params(labelsize=8)
        fig.suptitle(f"{name}   |   dark blue = OSM rivers, red = district boundaries, dots = main roads, triangle = school, plus = health, star = chosen place", fontsize=10)
        fr_pct, fc_pct = 100 * fr.sum() / max(1, np.isfinite(raw).sum()), 100 * fc.sum() / max(1, np.isfinite(cor).sum())
        fig.text(0.5, 0.01, f"Share of this window flooded: raw DEM {fr_pct:.1f}%, corrected DEM {fc_pct:.1f}%. A what-if from terrain height, not a forecast.", ha="center", fontsize=9)
        fig.tight_layout(rect=(0, 0.06, 1, 0.95))
        f = OUT / (name.lower().replace(" ", "_") + f"_rise{RISE:g}m.png"); fig.savefig(f); plt.close(fig)
        print(f"{name}: raw {fr_pct:.1f}% corrected {fc_pct:.1f}% -> {f}")
    print(f"\nDone. Send the PNG files in {OUT} back so they can be looked at.")


if __name__ == "__main__":
    main()
