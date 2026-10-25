import { NO_DATA } from "../../lib/sdgApi";

// Plain CSS bars: conservative (teal) and upper (gold) bound per year.
export default function YearBars({ rows, field, format, title }) {
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const get = (y, b) => rows.find((r) => r.year === y && r.bound === b)?.[field] ?? null;
  const max = Math.max(1, ...rows.map((r) => r[field] ?? 0));
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
      <div className="text-[13px] font-medium text-white mb-3">{title}</div>
      <div className="space-y-2">
        {years.map((y) => (
          <div key={y} className="flex items-center gap-3">
            <div className="w-10 text-[13px] text-ink-200 tabular-nums">{y}</div>
            <div className="flex-1 space-y-1">
              {[["lower_unflagged", "bg-signal-teal"], ["upper_union", "bg-signal-gold"]].map(([b, c]) => {
                const v = get(y, b);
                return (
                  <div key={b} className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-ink-800 flex-1 overflow-hidden">
                      <div className={`h-full ${c}`} style={{ width: `${v == null ? 0 : (100 * v) / max}%` }} />
                    </div>
                    <div className="w-32 text-right text-[13px] text-ink-200 tabular-nums">{v == null ? NO_DATA : format(v)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[13px] text-ink-300">
        <span><span className="inline-block w-2 h-2 rounded-full bg-signal-teal mr-1" />Conservative</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-signal-gold mr-1" />Upper</span>
      </div>
    </div>
  );
}
