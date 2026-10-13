export default function ComingSoon({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-ink-800 border border-ink-700 flex items-center justify-center mb-4">
        <Icon size={24} className="text-signal-teal" strokeWidth={1.8} />
      </div>
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-ink-400 max-w-sm mt-1.5">{description}</p>
      <span className="mt-4 text-[11px] font-mono uppercase tracking-wide text-ink-500 border border-ink-700 rounded-full px-3 py-1">
        Coming next
      </span>
    </div>
  );
}
