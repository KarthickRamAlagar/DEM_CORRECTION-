import { useId, useMemo, useState } from "react";

// ---------- number formats (a missing value is never turned into a number)
const nz = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
export const isNo = nz;
export const num = (v, d = 0) => (nz(v) ? null : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const big = (v) => (nz(v) ? null : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : Number(v).toFixed(0));
export const pc = (v, d = 1) => (nz(v) ? null : `${(v * 100).toFixed(d)}%`);
export const inr = (v) => (nz(v) ? null : Math.abs(v) >= 1e7 ? `INR ${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 1 })} crore` : Math.abs(v) >= 1e5 ? `INR ${(v / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} lakh` : `INR ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
export const when = (iso) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

export const C = {
  raw: "rgb(var(--ink-300))", good: "rgb(var(--signal-teal))", second: "rgb(var(--signal-sky))", warn: "rgb(var(--signal-amber))",
  bad: "rgb(var(--signal-red))", grid: "rgb(var(--ink-700))", text: "rgb(var(--ink-200))", muted: "rgb(var(--ink-400))",
};

export function NoData({ why }) {
  return <span className="italic text-ink-400" title={why || "No data"}>No data{why ? <span className="not-italic text-ink-500 text-[12px]"> · {why}</span> : null}</span>;
}

export function Pill({ tone = "grey", children }) {
  const t = { green: "border-signal-green/50 text-signal-green", amber: "border-signal-amber/50 text-signal-amber", red: "border-signal-red/50 text-signal-red", teal: "border-signal-teal/50 text-signal-teal", grey: "border-ink-600 text-ink-300" }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] leading-5 ${t}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>;
}
export const statusTone = (s) => ({ "Has data": "green", Partly: "amber", "No data": "grey", Live: "teal" }[s] || "grey");

export function Big({ label, value, sub, tone = "text-white", small, children }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/55 px-4 py-3.5 min-w-0">
      <p className="text-[12.5px] text-ink-400">{label}</p>
      <p className={`mt-1.5 ${small ? "text-[19px] leading-tight" : "text-[26px] leading-none"} font-semibold font-display tabular-nums ${tone}`}>{value ?? <span className="text-[18px] font-normal"><NoData /></span>}</p>
      {sub && <p className="text-[12px] text-ink-400 mt-2 leading-snug">{sub}</p>}
      {children}
    </div>
  );
}

export function Section({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-ink-700/60 bg-ink-900/55 p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-[16px] font-semibold text-white leading-snug">{title}</h3>}
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-400 max-w-[72ch]">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

// A chart with a Chart / Table switch, so the numbers are always reachable without colour or hover.
export function ChartCard({ title, subtitle, columns, rows, children, legend, footnote }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Section
      title={title}
      subtitle={subtitle}
      right={rows && (
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
          className="shrink-0 rounded-md border border-ink-700/70 px-2.5 py-1 text-[12.5px] text-ink-300 hover:text-white">
          {asTable ? "Show chart" : "Show table"}
        </button>
      )}
    >
      {legend && !asTable && <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-300">{legend.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />{l.label}</span>))}</div>}
      {asTable ? <DataTable columns={columns} rows={rows} /> : children}
      {footnote && <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">{footnote}</p>}
    </Section>
  );
}

export function DataTable({ columns, rows, dense }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left ${dense ? "text-[12.5px]" : "text-[13px]"}`}>
        <thead><tr className="text-ink-400 border-b border-ink-700/70">{columns.map((c) => <th key={c.key} scope="col" className={`py-2 pr-4 font-medium whitespace-nowrap ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-b border-ink-800/80 last:border-0">{columns.map((c) => {
            const raw = r[c.key]; const v = c.fmt ? c.fmt(raw, r) : raw;
            return <td key={c.key} className={`py-2 pr-4 align-top text-ink-100 tabular-nums ${c.right ? "text-right" : ""}`}>{nz(v) || v === "" ? <NoData /> : v}</td>;
          })}</tr>))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- charts (plain SVG, theme colours, 2 px gaps, labels on the bars)
const fm = (n, d = 2) => Number(n).toFixed(d);

export function PairBars({ rows, unit = "m", rawLabel = "Raw DEM", corLabel = "Corrected", label }) {
  const W = 640, L = 168, R = 70, rowH = 46, H = rows.length * rowH + 6;
  const max = Math.max(...rows.flatMap((r) => [r.raw, r.corrected].filter((v) => !nz(v))), 1) * 1.04;
  const w = (v) => ((W - L - R) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || "Error before and after correction"}>
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        return (
          <g key={r.label}>
            <text x={0} y={y + 22} fontSize="12.5" fill={C.text}>{r.label}</text>
            {!nz(r.raw) && <g><rect x={L} y={y + 4} width={w(r.raw)} height={15} rx="2" fill={C.raw}><title>{`${r.label}: ${rawLabel} ${fm(r.raw)} ${unit}`}</title></rect><text x={L + w(r.raw) + 6} y={y + 16} fontSize="12" fill={C.text}>{fm(r.raw)} {unit}</text></g>}
            {!nz(r.corrected) && <g><rect x={L} y={y + 21} width={w(r.corrected)} height={15} rx="2" fill={C.good}><title>{`${r.label}: ${corLabel} ${fm(r.corrected)} ${unit}`}</title></rect><text x={L + w(r.corrected) + 6} y={y + 33} fontSize="12" fill={C.text}>{fm(r.corrected)} {unit}</text></g>}
          </g>
        );
      })}
    </svg>
  );
}

export function BinsChart({ labels, raw, corrected, label }) {
  const W = 640, H = 230, L = 36, B = 30, T = 14, n = labels.length, gw = (W - L - 8) / n;
  const max = Math.max(...raw, ...corrected, 0.01) * 1.1, h = (v) => ((H - B - T) * v) / max;
  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((t) => t <= max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || "Share of points by size of error"}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - 4} y1={H - B - h(t)} y2={H - B - h(t)} stroke={C.grid} strokeWidth="1" /><text x={L - 6} y={H - B - h(t) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{Math.round(t * 100)}%</text></g>)}
      {labels.map((lb, i) => {
        const x = L + i * gw + gw * 0.12, bw = gw * 0.37;
        return (
          <g key={lb}>
            <rect x={x} y={H - B - h(raw[i])} width={bw} height={h(raw[i])} rx="2" fill={C.raw}><title>{`${lb}: raw ${(raw[i] * 100).toFixed(1)}%`}</title></rect>
            <rect x={x + bw + 2} y={H - B - h(corrected[i])} width={bw} height={h(corrected[i])} rx="2" fill={C.good}><title>{`${lb}: corrected ${(corrected[i] * 100).toFixed(1)}%`}</title></rect>
            <text x={x + bw / 2} y={H - B - h(raw[i]) - 4} fontSize="10.5" textAnchor="middle" fill={C.text}>{(raw[i] * 100).toFixed(0)}</text>
            <text x={x + bw + 2 + bw / 2} y={H - B - h(corrected[i]) - 4} fontSize="10.5" textAnchor="middle" fill={C.text}>{(corrected[i] * 100).toFixed(0)}</text>
            <text x={L + i * gw + gw / 2} y={H - 10} fontSize="12" textAnchor="middle" fill={C.text}>{lb}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function HBars({ rows, fmt = (v) => fm(v, 3), color = C.good, label }) {
  const W = 640, L = 170, R = 74, rowH = 24, H = rows.length * rowH + 4;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || "Ranked values"}>
      {rows.map((r, i) => {
        const y = i * rowH + 2, w = ((W - L - R) * r.value) / max;
        return (
          <g key={r.label}>
            <text x={0} y={y + 14} fontSize="12" fill={C.text}>{r.label}</text>
            <rect x={L} y={y + 3} width={Math.max(w, 1)} height={13} rx="2" fill={r.color || color}><title>{`${r.label}: ${fmt(r.value)}`}</title></rect>
            <text x={L + w + 6} y={y + 14} fontSize="11.5" fill={C.text}>{fmt(r.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Coverage by group against a target line
export function CoverageBars({ rows, target, label }) {
  const W = 640, L = 170, R = 150, rowH = 28, H = rows.length * rowH + 30;
  const x = (v) => L + ((W - L - R) * v) / 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || "Interval coverage by terrain group"}>
      <text x={x(target)} y={11} fontSize="11" textAnchor="middle" fill={C.text}>target {(target * 100).toFixed(0)}%</text>
      {rows.map((r, i) => {
        const y = i * rowH + 26, ok = r.value >= target - 0.02;
        return (
          <g key={r.label}>
            <text x={0} y={y + 13} fontSize="12" fill={C.text}>{r.label}</text>
            <rect x={L} y={y + 2} width={x(r.value) - L} height={14} rx="2" fill={ok ? C.good : C.warn}><title>{`${r.label}: ${(r.value * 100).toFixed(1)}% inside the interval`}</title></rect>
            <text x={W} y={y + 13} fontSize="11.5" textAnchor="end" fill={C.text}>{(r.value * 100).toFixed(1)}%{ok ? "" : " · below target"}</text>
          </g>
        );
      })}
      <line x1={x(target)} x2={x(target)} y1={16} y2={H - 4} stroke={C.text} strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}

// Lines over a shared x axis with a hover read-out
export function LineSeries({ xs, series, fmt = (v) => v, label, height = 220 }) {
  const W = 640, H = height, L = 52, R = 90, T = 12, B = 28, [hi, setHi] = useState(null), uid = useId();
  const all = series.flatMap((s) => s.values.filter((v) => !nz(v)));
  const max = Math.max(...all, 1e-9) * 1.08;
  const X = (i) => L + ((W - L - R) * i) / Math.max(1, xs.length - 1), Y = (v) => H - B - ((H - B - T) * v) / max;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / (W - L - R)) * (xs.length - 1)))));
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || "Values by year"} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke={C.grid} strokeWidth="1" /><text x={L - 6} y={Y(t) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{fmt(t)}</text></g>)}
      {xs.map((x, i) => <text key={uid + x} x={X(i)} y={H - 8} fontSize="11.5" textAnchor="middle" fill={C.text}>{x}</text>)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (nz(v) ? null : [X(i), Y(v)])).filter(Boolean);
        const last = pts[pts.length - 1];
        return (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={pts.map((p) => p.join(",")).join(" ")} />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={s.color} stroke="rgb(var(--ink-900))" strokeWidth="2" />)}
            {last && <text x={last[0] + 8} y={last[1] + 4} fontSize="11.5" fill={C.text}>{s.name}</text>}
          </g>
        );
      })}
      {hi !== null && (
        <g pointerEvents="none">
          <line x1={X(hi)} x2={X(hi)} y1={T} y2={H - B} stroke={C.text} strokeWidth="1" strokeDasharray="3 3" />
          <g transform={`translate(${Math.min(X(hi) + 10, W - 190)},${T + 4})`}>
            <rect width="176" height={22 + series.length * 17} rx="6" fill="rgb(var(--ink-950))" stroke={C.grid} />
            <text x="10" y="16" fontSize="12" fontWeight="600" fill="rgb(var(--ink-100))">{xs[hi]}</text>
            {series.map((s, k) => <text key={s.name} x="10" y={33 + k * 17} fontSize="11.5" fill={C.text}>{s.name}: {nz(s.values[hi]) ? "No data" : fmt(s.values[hi])}</text>)}
          </g>
        </g>
      )}
    </svg>
  );
}

export function Meter({ label, value, max = 100, unit = "%", sub, warnAt = 75, badAt = 90 }) {
  const p = nz(value) ? null : Math.max(0, Math.min(100, (value / max) * 100));
  const level = p === null ? null : p >= badAt ? "High" : p >= warnAt ? "Busy" : "Normal";
  const col = level === "High" ? C.bad : level === "Busy" ? C.warn : C.good;
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/55 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2"><p className="text-[12.5px] text-ink-400">{label}</p>{level && <span className="text-[12px] text-ink-300">{level}</span>}</div>
      <p className="mt-1.5 text-[24px] leading-none font-semibold font-display tabular-nums text-white">{p === null ? <span className="text-[16px] font-normal"><NoData /></span> : `${Number(value).toFixed(unit === "%" ? 0 : 1)}${unit === "%" ? "%" : ` ${unit}`}`}</p>
      <div className="mt-3 h-2 rounded-full bg-ink-700/70 overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={p === null ? undefined : Math.round(p)} aria-valuemin="0" aria-valuemax="100">
        {p !== null && <div className="h-full rounded-full" style={{ width: `${p}%`, background: col }} />}
      </div>
      {sub && <p className="text-[12px] text-ink-400 mt-2">{sub}</p>}
    </div>
  );
}

export function Spark({ values, color = C.good, width = 160, height = 34, label }) {
  const v = values.filter((x) => !nz(x));
  if (v.length < 2) return <span className="text-[12px] text-ink-500">collecting…</span>;
  const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * width},${height - 3 - ((x - lo) / sp) * (height - 6)}`).join(" ");
  return <svg width={width} height={height} role="img" aria-label={label || "Recent values"}><polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" points={pts} /></svg>;
}

export function KeyVals({ rows }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,15rem)_1fr] gap-x-6 gap-y-2 text-[13px]">
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-ink-400">{k}</dt>
          <dd className="text-ink-100 break-words min-w-0">{nz(v) || v === "" ? <NoData /> : v}{note && <span className="text-ink-400"> · {note}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function useMemoLayers(layers) {
  return useMemo(() => Object.fromEntries((layers?.layers || []).map((l) => [l.id, l])), [layers]);
}
