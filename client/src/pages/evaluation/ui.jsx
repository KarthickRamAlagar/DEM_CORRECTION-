import { useMemo, useState } from "react";

// Shared building blocks for the Evaluation page.
// Colours are theme tokens (Dark / Light); the blue / amber pair is defined on .eval-page.

export const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(2));
export const f3 = (v) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(3));
export const pct = (v) => `${(v * 100).toFixed(1)}%`;

export const SPATIAL = "rgb(var(--ev-spatial))";
export const RANDOM = "rgb(var(--ev-random))";

export function Card({ title, subtitle, children, className = "", right }) {
  return (
    <section className={`rounded-xl border border-ink-700/60 bg-ink-900/55 backdrop-blur-sm p-5 sm:p-6 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] leading-snug font-semibold text-white">{title}</h2>}
            {subtitle && <p className="text-[13px] leading-relaxed text-ink-400 mt-1 max-w-[70ch]">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = "text-white" }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/55 backdrop-blur-sm px-5 py-4">
      <p className="text-[13px] text-ink-400">{label}</p>
      <p className={`ev-serif mt-1.5 text-[30px] leading-none font-semibold ${tone}`}>{value}</p>
      {sub && <p className="text-[12.5px] text-ink-400 mt-2 leading-snug">{sub}</p>}
    </div>
  );
}

export function Note({ children, tone = "amber" }) {
  const bar =
    tone === "amber" ? "border-signal-amber" : tone === "red" ? "border-signal-red" : tone === "green" ? "border-signal-green" : "border-signal-teal";
  return <p className={`text-[13px] leading-relaxed text-ink-300 border-l-2 ${bar} bg-ink-800/40 rounded-r-md px-3.5 py-2.5`}>{children}</p>;
}

// Underline tabs (primary) or small pills (secondary)
export function Tabs({ tabs, value, onChange, variant = "line" }) {
  if (variant === "pill") {
    return (
      <div className="flex gap-1.5 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`shrink-0 px-3 py-1.5 rounded-md text-[13px] border transition-colors ${
              value === t.id ? "border-signal-teal/60 bg-signal-teal/10 text-ink-100" : "border-ink-700/70 text-ink-400 hover:text-ink-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-ink-700/60" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 -mb-px pb-3 pt-1 text-[14px] border-b-2 transition-colors ${
            value === t.id ? "border-signal-teal text-white font-medium" : "border-transparent text-ink-400 hover:text-ink-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* Horizontal bar list (Section 2). rows: [{label, value, color?, bold?}] */
export function Bars({ rows, max, unit = "m", decimals = 2, refLine, labelWidth = "w-56" }) {
  const top = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 sm:gap-3 text-[13px]">
          <span className={`${labelWidth} max-w-[40%] sm:max-w-none shrink-0 truncate ${r.bold ? "text-white font-medium" : "text-ink-300"}`} title={r.label}>
            {r.label}
          </span>
          <div className="relative flex-1 h-3.5 bg-ink-800/70 rounded-sm">
            <div className="h-3.5 rounded-sm" style={{ width: `${Math.min(100, (Math.abs(r.value) / top) * 100)}%`, background: r.color || SPATIAL }} />
            {refLine !== undefined && <div className="absolute top-0 bottom-0 w-px bg-ink-300/70" style={{ left: `${(refLine / top) * 100}%` }} />}
          </div>
          <span className="w-16 text-right text-ink-200">
            {Number(r.value).toFixed(decimals)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/*
 * Ranked dot plot: lowest error first. A value axis that does not start at zero is used on
 * purpose (bars from zero would make a 3% difference invisible); the axis range is printed.
 * rows: [{ label, value, tag? }]   ref: { value, label }   color: CSS colour string
 */
export function RankedDots({ rows, domain, color, refLine, unit = " m", valueDecimals = 3 }) {
  const sorted = useMemo(() => [...rows].filter((r) => r.value != null).sort((a, b) => a.value - b.value), [rows]);
  const [lo, hi] = domain;
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const span = hi - lo;
  const step = span <= 0.8 ? 0.1 : span <= 1.6 ? 0.2 : 0.5;
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const refInside = refLine && refLine.value >= lo && refLine.value <= hi;
  return (
    <div>
      <div className="flex items-center gap-3 text-[11.5px] text-ink-500 mb-1">
        <span className="w-5 shrink-0" />
        <span className="w-44 sm:w-56 shrink-0" />
        <div className="relative flex-1 h-4">
          {ticks.map((t, i) => (
            <span key={i} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>
              {t.toFixed(2)}
            </span>
          ))}
        </div>
        <span className="w-16 shrink-0" />
      </div>
      <ol className="space-y-0.5">
        {sorted.map((r, i) => {
          const best = i === 0;
          return (
            <li key={r.label} className="flex items-center gap-3 h-8 text-[13px]">
              <span className="w-5 shrink-0 text-right text-ink-500">{i + 1}</span>
              <span className="w-44 sm:w-56 shrink-0 flex items-center gap-2 min-w-0" title={r.label}>
                <span className={`truncate ${best ? "text-white font-medium" : "text-ink-300"}`}>{r.label}</span>
                {r.tag && <span className="shrink-0 text-[10.5px] leading-none px-1.5 py-1 rounded border border-ink-600 text-ink-400">{r.tag}</span>}
              </span>
              <div className="relative flex-1 h-full">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-ink-700/70" />
                {ticks.map((t, k) => (
                  <div key={k} className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-ink-700/80" style={{ left: pos(t) }} />
                ))}
                {refInside && <div className="absolute top-0 bottom-0 border-l border-dashed border-ink-500/80" style={{ left: pos(refLine.value) }} />}
                <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: 0, width: pos(r.value), background: color, opacity: best ? 0.55 : 0.28 }} />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: pos(r.value), width: best ? 13 : 9, height: best ? 13 : 9, background: color, boxShadow: best ? `0 0 0 3px rgb(var(--ink-900)), 0 0 0 4.5px ${color}` : "none" }}
                />
              </div>
              <span className={`w-16 shrink-0 text-right ${best ? "text-white font-medium" : "text-ink-300"}`}>{r.value.toFixed(valueDecimals)}</span>
            </li>
          );
        })}
      </ol>
      {refLine && (
        <p className="mt-2 text-[12px] text-ink-400 flex items-center gap-2">
          <span className="inline-block w-4 border-t border-dashed border-ink-500" />
          {refLine.label}: {refLine.value.toFixed(3)}
          {unit}
          {!refInside && " (beyond the right edge of this chart)"}
        </p>
      )}
    </div>
  );
}

export function Table({ cols, rows, highlight, sortable = false, defaultSort }) {
  const [sort, setSort] = useState(defaultSort || null); // { key, dir }
  const data = useMemo(() => {
    if (!sort) return rows;
    const d = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return typeof x === "string" ? d * x.localeCompare(y) : d * (x - y);
    });
  }, [rows, sort]);
  const toggle = (key) => setSort((s) => (s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-ink-400 border-b border-ink-700/70">
            {cols.map((c) => {
              const active = sort && sort.key === c.key;
              return (
                <th key={c.key} className={`py-2.5 px-3 font-medium whitespace-nowrap ${c.left ? "text-left" : "text-right"}`}>
                  {sortable ? (
                    <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-white" title="Click to sort">
                      {c.label}
                      <span className={`text-[10px] ${active ? "text-signal-teal" : "text-ink-600"}`}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const h = highlight ? highlight(r) : null;
            return (
              <tr key={i} className={`border-b border-ink-700/35 ${h === "win" ? "bg-signal-teal/10" : h === "tie" ? "bg-ink-800/40" : ""}`}>
                {cols.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`py-2 px-3 ${c.left ? "text-left text-white whitespace-nowrap" : "text-right text-ink-200 whitespace-nowrap"} ${
                      ci === 0 && h === "win" ? "border-l-2 border-signal-teal" : ""
                    }`}
                  >
                    {c.fmt ? c.fmt(r[c.key], r) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
