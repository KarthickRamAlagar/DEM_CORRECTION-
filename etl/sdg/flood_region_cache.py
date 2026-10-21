"""
flood_region_cache.py - precompute the "river rises X m" flood maps for the WHOLE river-height box, raw DEM vs corrected DEM.

Why: the place page shows one circle. This gives the regional picture (Nepal Terai and the Indian plains next to it) so the
effect of the DEM correction on the terrain what-if can be seen on a map. It is a terrain-based what-if (height above nearest
river, HAND). No flow physics. Not a forecast. It does NOT show that the corrected DEM predicts floods better: that was tested
and no measurable difference was found.

Reads (nothing is modified): data/processed/sdg/hand/hand_{raw,corrected}_2022.tif, exposure_base_ext/{pop_2020,cropland_frac,district_id}.tif,
exposure_base_ext/districts_table.csv.
Writes ONE new file: data/processed/sdg/hand/region_flood_cache.npz  (about a few MB).

Run from the repo root:  uv run python -I etl/sdg/flood_region_cache.py
"""
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
SDG = ROOT / "data/processed/sdg"
HAND = {"raw": SDG / "hand/hand_raw_2022.tif", "corrected": SDG / "hand/hand_corrected_2022.tif"}
BASE = SDG / "exposure_base_ext"
OUT = SDG / "hand/region_flood_cache.npz"

W0, N0, PX = 80.3, 29.0, 1 / 1200           # extended grid origin and 3 arc-second cell
BOX = (81.9, 25.4, 84.0, 28.0)              # river-height box: west, south, east, north
KM_DEG = 111.195
RISES = [0.5, 1, 2, 3, 4, 6, 8, 10]
BLK = 6                                     # 1 arc-second pixels per output block (6 arc-seconds, about 185 m)
STRIP = 128                                 # block rows per strip


def read(path, c0, r0, w, h):
    with rasterio.open(path) as s:
        return s.read(1, window=Window(c0, r0, w, h))


def main():
    for p in list(HAND.values()) + [BASE / "pop_2020.tif", BASE / "cropland_frac.tif", BASE / "district_id.tif", BASE / "districts_table.csv"]:
        if not p.exists():
            sys.exit(f"STOP: missing {p}")
    c3, r3 = round((BOX[0] - W0) / PX), round((N0 - BOX[3]) / PX)
    w3, h3 = round((BOX[2] - BOX[0]) / PX), round((BOX[3] - BOX[1]) / PX)
    nbc, nbr = w3 // 2, h3 // 2
    with rasterio.open(HAND["raw"]) as s:
        assert (s.height, s.width) == (h3 * 3, w3 * 3), f"HAND raster is {s.height}x{s.width}, expected {h3 * 3}x{w3 * 3}"
    assert nbc * BLK == w3 * 3 and nbr * BLK == h3 * 3

    pop = read(BASE / "pop_2020.tif", c3, r3, w3, h3).astype("float64")
    pop = np.where(pop > -9000, pop, 0.0)
    crop = read(BASE / "cropland_frac.tif", c3, r3, w3, h3).astype("float64")
    did = read(BASE / "district_id.tif", c3, r3, w3, h3)
    tab = pd.read_csv(BASE / "districts_table.csv")
    iso_of = np.zeros(int(tab.did.max()) + 1, dtype=np.uint8)
    iso_of[tab.did.values] = np.where(tab.iso.values == "IND", 1, 2)

    lat_c = N0 - (r3 + np.arange(h3) + 0.5) * PX                                 # 3" cell centre latitudes
    cell_ha = ((PX * KM_DEG) ** 2 * np.cos(np.radians(lat_c)) * 100.0)[:, None] * np.ones((1, w3))
    blk2 = lambda a: a.reshape(nbr, 2, nbc, 2).sum(axis=(1, 3))
    pop_b, crop_b, ha_b = blk2(pop), blk2(crop * cell_ha), blk2(cell_ha)
    iso_b = iso_of[np.clip(did[::2, ::2], 0, len(iso_of) - 1)] * (did[::2, ::2] > 0)
    iso_b = iso_b.astype(np.uint8)

    frac = {k: np.zeros((len(RISES), nbr, nbc), dtype=np.uint8) for k in HAND}
    t0 = time.time()
    for b0 in range(0, nbr, STRIP):
        b1 = min(b0 + STRIP, nbr)
        win = (0, b0 * BLK, w3 * 3, (b1 - b0) * BLK)
        for k, p in HAND.items():
            h = read(p, *win).astype("float32")
            ok = (h > -9990) & np.isfinite(h)
            for i, r in enumerate(RISES):
                m = ((h <= r) & ok).reshape(b1 - b0, BLK, nbc, BLK).mean(axis=(1, 3))
                frac[k][i, b0:b1] = np.round(m * 255).astype(np.uint8)
        print(f"  strip {b0 // STRIP + 1}/{math.ceil(nbr / STRIP)}  {time.time() - t0:.0f}s", flush=True)

    stats = {}
    for k in HAND:
        for i, r in enumerate(RISES):
            f = frac[k][i] / 255.0
            for code, iso in ((1, "IND"), (2, "NPL")):
                m = iso_b == code
                stats[f"{k}|{r}|{iso}"] = {"km2": float((f * ha_b / 100.0)[m].sum()), "people": float((f * pop_b)[m].sum()), "cropland_ha": float((f * crop_b)[m].sum())}
    meta = {"rises": RISES, "block_arcsec": BLK, "box": BOX, "stats": stats,
            "note": "Terrain what-if (height above nearest river) from the 2022 raw and corrected DEM. Not a forecast. No flow physics."}
    np.savez_compressed(OUT, raw=frac["raw"], corrected=frac["corrected"], iso=iso_b, ha=ha_b.astype("float32"), meta=np.array(json.dumps(meta)))
    print(f"\nwrote {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)  in {time.time() - t0:.0f}s")
    for iso in ("NPL", "IND"):
        for r in (2, 4):
            a, b = stats[f"raw|{r}|{iso}"], stats[f"corrected|{r}|{iso}"]
            print(f"  {iso} rise {r} m: flooded km2 raw {a['km2']:.0f} corrected {b['km2']:.0f} | people raw {a['people']:.0f} corrected {b['people']:.0f}")


if __name__ == "__main__":
    main()
