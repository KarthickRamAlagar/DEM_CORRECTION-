import { Info } from "lucide-react";

// Shared building blocks for the SDG pages. Colours come from the app's own tokens so every theme works.
// Text scale: body 14, secondary 13, never below 12. Labels are sentence case; figures use tabular numerals.

// Glass look shared by the SDG pages: a soft translucent panel with a thin light edge.
export const GLASS = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";
// Region wording: "Terai" is replaced by plain words wherever text from the server or the data files is shown.
export const plainText = (t) => String(t ?? "").replace(/Nepal(?:'s)? Terai(?: lowlands)?/g, "the southern plains of Nepal").replace(/\bTerai\b/g, "southern plains");
// Bento grid: 12 columns on a wide screen, 6 on a medium one, 1 on a narrow one. Give each card a span class such as "lg:col-span-4".
export function Bento({ children, className = "" }) {
  return <div className={`grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12 ${className}`}>{children}</div>;
}
export function BentoCard({ title, value, sub, children, className = "", action }) {
  return (
    <div className={`${GLASS} p-4 min-w-0 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && <div className="text-[13px] font-medium text-ink-200">{title}</div>}
          {action}
        </div>
      )}
      {value != null && <div className="mt-1.5 text-[22px] font-semibold leading-tight tabular-nums text-white">{value}</div>}
      {sub && <div className="mt-1.5 text-[13px] leading-snug text-ink-300">{sub}</div>}
      {children}
    </div>
  );
}

export function Banner({ children, tone = "teal" }) {
  const tones = {
    teal: "border-signal-teal/70 text-ink-100",
    amber: "border-signal-amber/80 text-ink-100",
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-r-lg border-l-[3px] bg-ink-850/70 px-3.5 py-2.5 text-[13px] leading-relaxed ${tones[tone]}`}>
      <Info size={15} className={`mt-[3px] shrink-0 ${tone === "amber" ? "text-signal-amber" : "text-signal-teal"}`} />
      <div>{children}</div>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-ink-800/80 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal ${
            value === o.id ? "bg-ink-600 text-white shadow-sm" : "text-ink-200 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, noData, active }) {
  return (
    <div className={`${GLASS} p-4 min-w-0 ${active ? "ring-1 ring-signal-teal/70" : ""}`}>
      <div className="text-[13px] text-ink-200">{label}</div>
      <div className={`mt-1.5 text-[24px] leading-8 font-semibold tabular-nums ${noData ? "text-ink-300 text-[18px]" : "text-white"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[13px] text-ink-300 leading-snug">{sub}</div>}
    </div>
  );
}

// Key figures of a page as one band with dividers, instead of a row of separate cards.
export function Figures({ items }) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[Math.min(4, items.length)];
  return (
    <div className={`grid grid-cols-1 ${cols} rounded-xl border border-ink-700/60 bg-ink-900/50 divide-y sm:divide-y-0 sm:divide-x divide-ink-700/60`}>
      {items.map((it) => (
        <div key={it.label} className="px-5 py-4 min-w-0">
          <div className="text-[13px] text-ink-200">{it.label}</div>
          <div className={`mt-1 font-semibold tabular-nums leading-tight ${it.noData ? "text-[18px] text-ink-300" : String(it.value).length > 16 ? "text-[21px] text-white" : "text-[26px] text-white"}`}>{it.value}</div>
          {it.sub && <div className="mt-1.5 text-[13px] leading-snug text-ink-300">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Section({ title, children, note }) {
  return (
    <section className="mt-8">
      <h3 className="text-[16px] font-semibold text-white">{title}</h3>
      {note && <p className="text-[13px] text-ink-300 mt-1 max-w-3xl leading-relaxed">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// columns: [{ key, label, align: "left"|"right", render?: (row) => node }]
export function DataTable({ columns, rows, rowKey, caption, highlight }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700/60">
      <table className="w-full text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-ink-850/80">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 text-[13px] font-medium text-ink-200 whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i} className={`border-t border-ink-700/50 align-top hover:bg-ink-850/50 ${highlight && highlight(r) ? "bg-signal-teal/10" : ""}`}>
              {columns.map((c, j) => (
                <td key={c.key} className={`px-4 py-3 text-ink-100 ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${j === 0 ? "text-white" : ""}`}>
                  {c.render ? c.render(r) : r[c.key]}{highlight && highlight(r) && j === 0 ? <span className="ml-2 rounded-full border border-signal-teal/60 px-2 py-0.5 text-[11.5px] font-medium text-ink-100">Your place</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Official SDG colours, used only as a small marker next to the goal name.
const SDG_COLOR = { "SDG 2": "#DDA63A", "SDG 11": "#FD9D24", "SDG 12": "#BF8B2E" };
export function SdgChip({ goal }) {
  if (!goal) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-100">
      <span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: SDG_COLOR[goal] ?? "#888" }} />
      {goal}
    </span>
  );
}

// Page tabs (keyboard: arrow keys move between tabs).
export function Tabs({ tabs, value, onChange, label }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n == null) return;
    e.preventDefault();
    onChange(tabs[(n + tabs.length) % tabs.length].id);
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex flex-nowrap gap-1 overflow-x-auto border-b border-ink-700/60">
      {tabs.map((t) => (
        <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal ${value === t.id ? "border-signal-teal text-white" : "border-transparent text-ink-200 hover:text-white"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
