"""End-to-end synthetic test of run_pilot.py: builds a small valley with an embankment, a 'truth' flood from a finer run with different roughness, raw and corrected DEMs
with different error, river lines and a stage file; runs the pilot; checks outputs and the gate logic.  uv run python -I etl/physics/test_pipeline_synthetic.py"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np, rasterio
from rasterio.transform import from_origin
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from solver import Solver
HERE = Path(__file__).resolve().parent
tmp = Path(tempfile.mkdtemp()); res = 1 / 3600.0; n = 300; lon0, lat0 = 82.4, 27.0
tr = from_origin(lon0, lat0 + n * res / 2 * 0 + 0.07, res, res)   # top-left
cy, cx = np.mgrid[0:n, 0:n]; dxm, dym = res * 111320 * np.cos(np.radians(27)), res * 110574
z_true = 60 - 0.0002 * dym * cy + 0.03 * np.abs(cx - 60)      # gentle fall downstream, valley rising away from the river at column 60
z_true[:, 60] -= 2.0
emb = (cx > 90) & (cx < 95) & (cy > 20) & (cy < 230); z_true[emb] += 5.0    # an embankment the terrain what-if cannot see
rng = np.random.default_rng(3)
def smooth_noise(s): 
    from scipy.ndimage import gaussian_filter
    a = gaussian_filter(rng.normal(0, 1, (n, n)), 12); return a / a.std() * s
z_raw = z_true + 3.0 + smooth_noise(1.2); z_cor = z_true + smooth_noise(0.5)   # raw sits ~3 m too high with larger error
def tif(path, a, dtype="float32", nodata=None):
    with rasterio.open(path, "w", driver="GTiff", height=a.shape[0], width=a.shape[1], count=1, dtype=dtype, crs="EPSG:4326", transform=tr, nodata=nodata) as d: d.write(a.astype(dtype), 1)
tif(tmp / "raw.tif", z_raw); tif(tmp / "cor.tif", z_cor)
ch = np.zeros((n, n), "uint8"); ch[:, 60] = 1; tif(tmp / "channel.tif", ch, "uint8")
# truth: coarse run on the true terrain, rougher floodplain, river rising 3 m over 4 days then held
k = 6; zt = z_true[:n // k * k, :n // k * k].reshape(n // k, k, n // k, k).mean((1, 3)); chc = np.zeros_like(zt, bool); chc[:, 10] = True
s = Solver(zt, dxm * k, dym * k, n=0.08); s.set_forced_level(chc, zt + 0)
days = 3; rise = [0, 1.0, 2.2, 3.0]
while s.t < (days + 0.5) * 86400:
    s.forced_eta = zt + np.interp(s.t / 86400, np.arange(4), rise); s.step()
obs = np.full((n, n), 255, "uint8"); fl = np.kron((s.h >= 0.1).astype("uint8"), np.ones((k, k), "uint8")); obs[:fl.shape[0], :fl.shape[1]] = fl; tif(tmp / "obs.tif", obs, "uint8")
import pandas as pd
pd.DataFrame({"date": pd.date_range("2022-09-10", periods=4), "rise_m": rise}).to_csv(tmp / "stage.csv", index=False)
ev = [{"name": f"synth{i}", "obs_date": "2022-09-13", "start": "2022-09-10", "observed": str(tmp / "obs.tif"), "stage_csv": str(tmp / "stage.csv")} for i in range(3)]
(tmp / "events.json").write_text(json.dumps(ev))
cen = f"{lon0 + 150 * res:.6f},{lat0 + 0.07 - 150 * res:.6f}"
r = subprocess.run([sys.executable, "-I", str(HERE / "run_pilot.py"), "--center", cen, "--half-km", "5", "--coarsen", "6", "--raw", str(tmp / "raw.tif"), "--corrected", str(tmp / "cor.tif"),
                    "--channel", str(tmp / "channel.tif"), "--events", str(tmp / "events.json"), "--out", str(tmp / "out"), "--no-plots"], capture_output=True, text=True)
print(r.stdout[-1800:]); print(r.stderr[-1500:])
ok = r.returncode == 0 and (tmp / "out/physics_gate.json").exists()
g = json.loads((tmp / "out/physics_gate.json").read_text()) if ok else {}; pr = json.loads((tmp / "out/pilot_result.json").read_text()) if ok else {}
checks = [("pilot ran and wrote the result and gate files", ok), ("3 events scored", g.get("events_scored") == 3), ("mass budget closes in every run", ok and all(abs(d["mass_error"]) < 1e-6 for e in pr["events"] for d in e["dem"].values() if "mass_error" in d)),
          ("physics beats terrain what-if on corrected DEM (embankment case)", g.get("passed") is True)]
for name, v in checks: print(("PASS  " if v else "FAIL  ") + name)
print("gate:", json.dumps(g)[:400]); sys.exit(0 if all(v for _, v in checks) else 1)
