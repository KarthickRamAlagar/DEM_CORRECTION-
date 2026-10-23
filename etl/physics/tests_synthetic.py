"""Synthetic checks for the solver. Run:  uv run python -I etl/physics/tests_synthetic.py   (about 1 minute). All must PASS before any pilot number is trusted."""
import sys, time, math
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent)); sys.stdout.reconfigure(encoding="utf-8")
from solver import Solver, G
res = []
def check(name, ok, detail=""):
    res.append(ok); print(("PASS  " if ok else "FAIL  ") + name + (f"   {detail}" if detail else ""))

# 1. lake at rest over a bumpy bed stays at rest
rng = np.random.default_rng(1); z = rng.normal(0, 0.4, (40, 40)); z[:, :5] += 3; eta0 = 1.0
h0 = np.maximum(eta0 - z, 0); s = Solver(z, 30, 30, n=0.03, h0=h0)
for _ in range(400): s.step()
check("lake at rest: no spurious flow", max(abs(s.qx).max(), abs(s.qy).max()) < 1e-6, f"max q {max(abs(s.qx).max(), abs(s.qy).max()):.2e}")
check("lake at rest: surface unchanged", abs((s.z + s.h)[s.h > 0.01].max() - eta0) < 1e-3 and abs((s.z + s.h)[s.h > 0.01].min() - eta0) < 1e-3)
check("lake at rest: volume kept", abs(s.mass_error()) < 1e-10, f"{s.mass_error():.1e}")

# 2. closed box, point source: all inflow is stored, depth never negative
z = np.zeros((50, 50)); s = Solver(z, 30, 30, n=0.04); m = np.zeros_like(z, bool); m[24:26, 24:26] = True
s.run(3600, source=(m, 20.0))
check("closed box: mass conserved", abs(s.mass_error()) < 1e-9, f"{s.mass_error():.1e}")
check("closed box: depth >= 0", s.h.min() >= 0)
check("closed box: stored = 20 m3/s x 3600 s", abs(s.stored() - 72000) / 72000 < 1e-6, f"{s.stored():.0f}")
sym = max(abs(s.h - s.h[::-1, :]).max(), abs(s.h - s.h[:, ::-1]).max()); check("point source spreads symmetrically", sym < 1e-9, f"{sym:.1e}")

# 3. steady flow on a slope: depth tends to the Manning normal depth
S0, n, q = 1e-3, 0.03, 2.0; ny, nx, dx = 150, 5, 20.0
z = (np.arange(ny)[::-1] * dx * S0)[:, None] * np.ones((1, nx)); s = Solver(z, dx, dx, n=n, free_edges=("S",), edge_slope=S0, dt_max=10)
top = np.zeros_like(z, bool); top[0, :] = True; Q = q * nx * dx
hn = (q * n / math.sqrt(S0)) ** 0.6
s.run(6 * 3600, source=(top, Q))
hm = s.h[ny // 2, nx // 2]; check("steady slope: mid-channel depth = Manning normal depth within 5%", abs(hm - hn) / hn < 0.05, f"model {hm:.3f} m, theory {hn:.3f} m")
check("steady slope: mass budget closes", abs(s.mass_error()) < 1e-6, f"{s.mass_error():.1e}")
qo = s.qy[-1, :].mean() if False else s.qy[ny // 2, :].mean(); check("steady slope: discharge per metre = inflow", abs(qo - q) / q < 0.05, f"{qo:.3f} vs {q}")

# 4. forced river level on a flat plain: water reaches only as far as time allows, volume budget closes
z = np.zeros((60, 120)); z[:, :3] = -2.0; s = Solver(z, 30, 30, n=0.05); fm = np.zeros_like(z, bool); fm[:, :3] = True
s.set_forced_level(fm, 1.0); s.run(2 * 3600, forced_series=lambda t: 1.0)
wetx = (s.h > 0.05).any(axis=0).nonzero()[0].max()
check("forced river level: water spreads but is time limited", 5 < wetx < 119, f"front at column {wetx} of 120")
check("forced river level: budget closes", abs(s.mass_error()) < 1e-6, f"{s.mass_error():.1e}")
# 5. rise of the same level cannot create water above the river level
check("forced level: no depth above the river surface on a flat plain", (s.z + s.h).max() <= 1.0 + 1e-6, f"max eta {(s.z + s.h).max():.3f}")

# 6. speed note
z = np.zeros((300, 300)); s = Solver(z, 30, 30, n=0.05, h0=np.full((300, 300), 0.5)); t0 = time.time()
for _ in range(50): s.step(2.0)
print(f"speed: {(time.time()-t0)/50*1000:.0f} ms per step for 300 x 300 cells")
print("\nALL PASS" if all(res) else "\nSOME FAILED"); sys.exit(0 if all(res) else 1)
