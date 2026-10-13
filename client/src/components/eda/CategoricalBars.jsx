export default function CategoricalBars({ items, color = "#60a5fa" }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-20 shrink-0 text-ink-300 truncate">{item.label}</span>
          <div className="flex-1 h-3 rounded-full bg-ink-800 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-ink-400">{item.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
