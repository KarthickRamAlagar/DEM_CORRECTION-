export default function StatTile({ label, value, unit, tone = "text-white" }) {
  return (
    <div className="flex-1 min-w-[120px] bg-ink-900/70 border border-ink-700/70 rounded-xl px-3.5 py-3">
      <div className="text-[10.5px] text-ink-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-display font-semibold mt-1 ${tone}`}>
        {value}
        {unit && <span className="text-xs text-ink-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
