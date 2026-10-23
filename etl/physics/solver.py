"""Local-inertial 2D shallow-water solver (Bates, Horritt and Fewtrell 2010; de Almeida et al. 2012) in plain numpy.
Staggered grid: depth h at cell centres, unit-width flux qx on the faces between columns, qy on the faces between rows.
  q_new = (q - g * hflow * dt * d(eta)/dx) / (1 + g * dt * n^2 * |q| / hflow^(7/3))
  h_new = h + dt * (inflow minus outflow per unit area)
Dry cells stay dry until water arrives; a cell can never give away more water than it holds (outgoing fluxes are scaled).
Optional: forced water level on chosen cells (a river stage), closed or free-flow edges, a source table.
Everything is volume-counted, so mass_error() reports the budget.  No numba, no GPU: use a pilot window of a few hundred cells a side."""
import numpy as np
G = 9.81
HMIN = 1e-3   # m, below this a face carries no flow

class Solver:
    def __init__(self, z, dx, dy, n=0.05, h0=None, free_edges=(), edge_slope=1e-3, alpha=0.7, dt_max=30.0, theta=0.9):
        self.z = np.asarray(z, dtype=np.float64); ny, nx = self.z.shape; self.ny, self.nx = ny, nx
        self.dx, self.dy = float(dx), float(dy)
        self.n = np.broadcast_to(np.asarray(n, dtype=np.float64), self.z.shape).copy()
        self.h = np.zeros_like(self.z) if h0 is None else np.asarray(h0, dtype=np.float64).copy()
        self.qx = np.zeros((ny, nx - 1)); self.qy = np.zeros((ny - 1, nx))
        self.free = set(free_edges); self.edge_slope = edge_slope; self.alpha = alpha; self.dt_max = dt_max; self.theta = theta
        self.nx_face = 0.5 * (self.n[:, :-1] + self.n[:, 1:])
        self.ny_face = 0.5 * (self.n[:-1, :] + self.n[1:, :])
        self.t = 0.0; self.v_in = 0.0; self.v_out = 0.0; self.v0 = float(self.h.sum() * dx * dy)
        self.forced_mask = None; self.forced_eta = None

    def set_forced_level(self, mask, eta):
        """Cells in mask are held at water-surface elevation >= eta (m). Water added to get there counts as inflow."""
        self.forced_mask = np.asarray(mask, dtype=bool); self.forced_eta = eta

    def _dt(self):
        hm = float(self.h.max()); c = np.sqrt(G * max(hm, 0.01))
        return min(self.dt_max, self.alpha * min(self.dx, self.dy) / c)

    def step(self, dt=None, source=None):
        """source: optional (boolean mask, discharge m3/s) adding water; returns dt used."""
        z, h = self.z, self.h; dx, dy = self.dx, self.dy
        dt = self._dt() if dt is None else dt
        eta = z + h
        # x faces
        hf = np.maximum(eta[:, :-1], eta[:, 1:]) - np.maximum(z[:, :-1], z[:, 1:])
        wet = hf > HMIN; hfs = np.where(wet, hf, 1.0)
        slope = (eta[:, 1:] - eta[:, :-1]) / dx
        q = self.qx
        # Bates 2010 with theta weighting on neighbouring fluxes along the face row
        qm = np.empty_like(q); qm[:, 1:-1] = 0.5 * (q[:, :-2] + q[:, 2:]); qm[:, 0] = q[:, 0]; qm[:, -1] = q[:, -1]
        qbar = self.theta * q + (1 - self.theta) * qm
        qn = (qbar - G * hfs * dt * slope) / (1 + G * dt * self.nx_face ** 2 * np.abs(q) / hfs ** (7.0 / 3.0))
        self.qx = np.where(wet, qn, 0.0)
        # y faces (rows increase southward; flux positive towards increasing row)
        hf = np.maximum(eta[:-1, :], eta[1:, :]) - np.maximum(z[:-1, :], z[1:, :])
        wet = hf > HMIN; hfs = np.where(wet, hf, 1.0)
        slope = (eta[1:, :] - eta[:-1, :]) / dy
        q = self.qy
        qm = np.empty_like(q); qm[1:-1, :] = 0.5 * (q[:-2, :] + q[2:, :]); qm[0, :] = q[0, :]; qm[-1, :] = q[-1, :]
        qbar = self.theta * q + (1 - self.theta) * qm
        qn = (qbar - G * hfs * dt * slope) / (1 + G * dt * self.ny_face ** 2 * np.abs(q) / hfs ** (7.0 / 3.0))
        self.qy = np.where(wet, qn, 0.0)
        # outgoing volume limiter: a cell cannot lose more than it holds
        out = np.zeros_like(h)
        out[:, :-1] += np.maximum(self.qx, 0) * dy * dt; out[:, 1:] += np.maximum(-self.qx, 0) * dy * dt
        out[:-1, :] += np.maximum(self.qy, 0) * dx * dt; out[1:, :] += np.maximum(-self.qy, 0) * dx * dt
        vol = h * dx * dy
        f = np.where(out > vol, vol / np.maximum(out, 1e-30), 1.0)
        if (f < 1).any():
            self.qx = np.where(self.qx > 0, self.qx * f[:, :-1], self.qx * f[:, 1:])
            self.qy = np.where(self.qy > 0, self.qy * f[:-1, :], self.qy * f[1:, :])
        # continuity
        dv = np.zeros_like(h)
        dv[:, :-1] -= self.qx * dy * dt; dv[:, 1:] += self.qx * dy * dt
        dv[:-1, :] -= self.qy * dx * dt; dv[1:, :] += self.qy * dx * dt
        # free-flow edges (normal depth at the given slope), outward only
        for e in self.free:
            sl = slice(None)
            if e == "N": hb, idx = h[0, :], (0, sl); w = dx
            elif e == "S": hb, idx = h[-1, :], (-1, sl); w = dx
            elif e == "W": hb, idx = h[:, 0], (sl, 0); w = dy
            else: hb, idx = h[:, -1], (sl, -1); w = dy
            nb = self.n[idx]; qo = np.where(hb > HMIN, np.sqrt(self.edge_slope) * hb ** (5.0 / 3.0) / nb, 0.0)
            qo = np.minimum(qo, hb * (dy if e in "NS" else dx) / dt)
            dv[idx] -= qo * w * dt; self.v_out += float((qo * w * dt).sum())
        if source is not None:
            m, Q = source; m = np.asarray(m, dtype=bool)          # Q m3/s shared equally by the cells in the mask
            dv[m] += Q * dt / np.count_nonzero(m); self.v_in += Q * dt
        self.h = np.maximum(h + dv / (dx * dy), 0.0)
        if self.forced_mask is not None:
            tgt = self.forced_eta
            need = np.where(self.forced_mask, np.maximum(tgt - z - self.h, 0.0), 0.0)
            self.h += need; self.v_in += float(need.sum() * dx * dy)
        self.t += dt
        return dt

    def stored(self): return float(self.h.sum() * self.dx * self.dy)
    def mass_error(self):
        """(stored - initial - in + out) / max(in, stored): 0 when volumes balance."""
        d = self.stored() - self.v0 - self.v_in + self.v_out; ref = max(self.v_in, self.stored(), 1.0); return d / ref

    def run(self, t_end, forced_series=None, record_every=None, on_record=None, source=None):
        """Run to t_end seconds. forced_series: f(t) -> eta level for forced cells."""
        nxt = record_every
        while self.t < t_end - 1e-9:
            if forced_series is not None: self.forced_eta = forced_series(self.t)
            dt = min(self._dt(), t_end - self.t); self.step(dt, source=source)
            if record_every and self.t >= nxt: on_record(self); nxt += record_every
        return self
