import { useMemo } from "react";
import { quantile, r2Score } from "./derive";
import { SPATIAL, RANDOM } from "./ui";

// Plain SVG charts (no chart library): actual-vs-predicted and residual plots.
// Colours are hex values the theme CSS already remaps for the Light theme.
const GRID = "#64748b";

function niceTicks(lo, hi, n = 5) {
  const step = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step));
  const s = [1, 2, 5, 10].map((m) => m * mag).find((m) => m >= step) || step;
  const out = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function Frame({ w, h, m, xr, yr, xLabel, yLabel, children }) {
  const sx = (v) => m.l + ((v - xr[0]) / (xr[1] - xr[0])) * (w - m.l - m.r);
  const sy = (v) => h - m.b - ((v - yr[0]) / (yr[1] - yr[0])) * (h - m.t - m.b);
  const xt = niceTicks(xr[0], xr[1]), yt = niceTicks(yr[0], yr[1]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img">
      {xt.map((t) => (
        <g key={`x${t}`}>
          <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={h - m.b} stroke={GRID} strokeOpacity="0.18" />
          <text x={sx(t)} y={h - m.b + 14} fontSize="10" textAnchor="middle" fill="#94a3b8">{t}</text>
        </g>
      ))}
      {yt.map((t) => (
        <g key={`y${t}`}>
          <line x1={m.l} x2={w - m.r} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeOpacity="0.18" />
          <text x={m.l - 6} y={sy(t) + 3} fontSize="10" textAnchor="end" fill="#94a3b8">{t}</text>
        </g>
      ))}
      <rect x={m.l} y={m.t} width={w - m.l - m.r} height={h - m.t - m.b} fill="none" stroke={GRID} strokeOpacity="0.35" />
      {children(sx, sy)}
      <text x={(m.l + w - m.r) / 2} y={h - 6} fontSize="11" textAnchor="middle" fill="#cbd5e1">{xLabel}</text>
      <text transform={`translate(12 ${(m.t + h - m.b) / 2}) rotate(-90)`} fontSize="11" textAnchor="middle" fill="#cbd5e1">{yLabel}</text>
    </svg>
  );
}

// view window that keeps ~98% of the points (a few extreme outliers would flatten everything)
function windowOf(values, lo = 0.01, hi = 0.99) {
  const a = quantile(values, lo), b = quantile(values, hi);
  const pad = (b - a) * 0.08 || 1;
  return [a - pad, b + pad];
}

export function ActualVsPredicted({ y, p, color = SPATIAL }) {
  const stats = useMemo(() => {
    const both = [...y, ...p];
    const win = windowOf(both);
    const out = y.filter((v, i) => v < win[0] || v > win[1] || p[i] < win[0] || p[i] > win[1]).length;
    return { win, out, r2: r2Score(y, p) };
  }, [y, p]);
  const w = 420, h = 340, m = { l: 44, r: 12, t: 10, b: 36 };
  return (
    <div>
      <Frame w={w} h={h} m={m} xr={stats.win} yr={stats.win} xLabel="Actual error (m)  =  reference - raw DEM" yLabel="Predicted error (m)">
        {(sx, sy) => (
          <>
            <line x1={sx(stats.win[0])} y1={sy(stats.win[0])} x2={sx(stats.win[1])} y2={sy(stats.win[1])} stroke="#94a3b8" strokeOpacity="0.95" strokeDasharray="5 4" />
            {y.map((v, i) =>
              v < stats.win[0] || v > stats.win[1] || p[i] < stats.win[0] || p[i] > stats.win[1] ? null : (
                <circle key={i} cx={sx(v)} cy={sy(p[i])} r="2" style={{ fill: color }} fillOpacity="0.45" />
              )
            )}
          </>
        )}
      </Frame>
      <p className="text-[11px] text-ink-400 mt-1">
        Dashed line = perfect prediction. R² on these {y.length.toLocaleString()} sampled points (differs slightly from the full-data R² in the benchmark table): <span className="font-mono text-ink-200">{stats.r2.toFixed(3)}</span>
        {stats.out > 0 && <> · {stats.out} extreme points are outside the view.</>}
      </p>
    </div>
  );
}

export function ResidualVsPredicted({ y, p, color = SPATIAL }) {
  const res = useMemo(() => y.map((v, i) => v - p[i]), [y, p]);
  const xr = useMemo(() => windowOf(p), [p]);
  const yr = useMemo(() => windowOf(res), [res]);
  const w = 420, h = 340, m = { l: 44, r: 12, t: 10, b: 36 };
  const out = res.filter((v, i) => v < yr[0] || v > yr[1] || p[i] < xr[0] || p[i] > xr[1]).length;
  return (
    <div>
      <Frame w={w} h={h} m={m} xr={xr} yr={yr} xLabel="Predicted error (m)" yLabel="Residual = actual - predicted (m)">
        {(sx, sy) => (
          <>
            <line x1={sx(xr[0])} x2={sx(xr[1])} y1={sy(0)} y2={sy(0)} stroke="#94a3b8" strokeOpacity="0.95" strokeDasharray="5 4" />
            {res.map((v, i) =>
              v < yr[0] || v > yr[1] || p[i] < xr[0] || p[i] > xr[1] ? null : (
                <circle key={i} cx={sx(p[i])} cy={sy(v)} r="2" style={{ fill: color }} fillOpacity="0.45" />
              )
            )}
          </>
        )}
      </Frame>
      <p className="text-[11px] text-ink-400 mt-1">
        A healthy residual plot is a flat, even cloud around zero. A funnel or slope means the error depends on the prediction size.
        {out > 0 && <> {out} extreme points are outside the view.</>}
      </p>
    </div>
  );
}

export function ResidualHistogram({ y, p, color = SPATIAL }) {
  const { bins, mean, sd, maxC, lo, hi } = useMemo(() => {
    const res = y.map((v, i) => v - p[i]);
    const [lo, hi] = windowOf(res, 0.005, 0.995);
    const n = 30, bw = (hi - lo) / n;
    const bins = Array.from({ length: n }, (_, i) => ({ x0: lo + i * bw, c: 0 }));
    res.forEach((v) => { if (v >= lo && v < hi) bins[Math.min(n - 1, Math.floor((v - lo) / bw))].c += 1; });
    const mean = res.reduce((a, b) => a + b, 0) / res.length;
    const sd = Math.sqrt(res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length);
    return { bins, mean, sd, maxC: Math.max(...bins.map((b) => b.c)), lo, hi };
  }, [y, p]);
  const w = 420, h = 260, m = { l: 44, r: 12, t: 10, b: 36 };
  return (
    <div>
      <Frame w={w} h={h} m={m} xr={[lo, hi]} yr={[0, maxC * 1.08]} xLabel="Residual (m)" yLabel="Number of points">
        {(sx, sy) => (
          <>
            {bins.map((b, i) => (
              <rect key={i} x={sx(b.x0) + 0.5} y={sy(b.c)} width={Math.max(1, sx(b.x0 + (hi - lo) / 30) - sx(b.x0) - 1)} height={sy(0) - sy(b.c)} style={{ fill: color }} fillOpacity="0.7" />
            ))}
            <line x1={sx(0)} x2={sx(0)} y1={m.t} y2={h - m.b} stroke="#94a3b8" strokeOpacity="0.95" strokeDasharray="5 4" />
          </>
        )}
      </Frame>
      <p className="text-[11px] text-ink-400 mt-1">
        Mean residual <span className="font-mono text-ink-200">{mean.toFixed(3)} m</span> (bias) · spread (SD) <span className="font-mono text-ink-200">{sd.toFixed(2)} m</span>.
      </p>
    </div>
  );
}

export const PROTOCOL_COLORS = { random: RANDOM, spatial: SPATIAL };
