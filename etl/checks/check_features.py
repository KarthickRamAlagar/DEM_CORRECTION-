import sys, numpy as np, rasterio
from rasterio.windows import Window
path = sys.argv[1]
wins = [(c, r) for r in (1000, 3500, 6000, 9000, 10100) for c in (1000, 7000, 12500)]
with rasterio.open(path) as ds:
    print(f"{path}: {ds.count} bands, {ds.width}x{ds.height}, {ds.dtypes[0]}, crs={ds.crs}")
    names = ds.descriptions
    stack = []
    for c, r in wins:
        stack.append(ds.read(window=Window(c, r, 600, 600)).reshape(ds.count, -1))
    data = np.concatenate(stack, axis=1).astype("float64")
print(f"sampled {data.shape[1]:,} pixels per band from {len(wins)} windows (incl. last strip)\n")
print(f"{'band':28s} {'NaN%':>6s} {'min':>10s} {'max':>10s} {'mean':>10s}")
empty = []
for i, n in enumerate(names):
    v = data[i]; ok = np.isfinite(v)
    if ok.sum() == 0:
        empty.append(n); print(f"{str(n):28s} {'100.0':>6s}  -- all NaN --"); continue
    print(f"{str(n):28s} {100*(1-ok.mean()):6.1f} {v[ok].min():10.3g} {v[ok].max():10.3g} {v[ok].mean():10.3g}")
print("\nALL-NaN bands:", empty if empty else "none")
