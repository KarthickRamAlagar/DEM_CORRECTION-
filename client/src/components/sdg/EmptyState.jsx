import { ArrowLeft } from "lucide-react";

// A friendly stop card: a golden badge with an emoji, what is known, what to do next.
// Used when the place has no river-height value, lies outside the river layer, or nothing floods at the chosen rise.
export const GOLD = "#F5B921";

export default function EmptyState({ emoji = "☀️", title, children, facts = [], actions = [], compact = false, detail }) {
  return (
    <section role="status" className={`rounded-2xl border border-ink-700/60 bg-ink-900/50 ${compact ? "p-5" : "p-7 sm:p-9"}`}>
      <div className={`flex ${compact ? "items-start gap-4" : "flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6"}`}>
        <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full" style={{ width: compact ? 52 : 72, height: compact ? 52 : 72, background: "rgba(245,185,33,0.16)", boxShadow: `inset 0 0 0 2px ${GOLD}` }}>
          <span style={{ fontSize: compact ? 26 : 34, lineHeight: 1 }}>{emoji}</span>
        </span>
        <div className="min-w-0 mt-4 sm:mt-0">
          <h3 className={`${compact ? "text-[17px]" : "text-[21px]"} font-semibold leading-snug text-white`}>{title}</h3>
          <div className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-100">{children}</div>
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-ink-700/60 pt-5 lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[13px] text-ink-300">{k}</dt><dd className="mt-0.5 break-words text-[15px] text-white tabular-nums">{v}</dd></div>
          ))}
        </dl>
      )}
      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {actions.map((a) => (
            <button key={a.label} ref={a.ref} type="button" onClick={a.onClick}
              className={a.primary
                ? "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-semibold text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal"
                : "inline-flex items-center gap-2 rounded-lg border border-ink-600 px-4 py-2.5 text-[14px] font-medium text-ink-100 hover:text-white hover:border-ink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal"}
              style={a.primary ? { background: GOLD } : undefined}>
              {a.back && <ArrowLeft size={15} />}{a.label}
            </button>
          ))}
        </div>
      )}
      {detail && <p className="mt-5 text-[12.5px] leading-relaxed text-ink-300 break-words">Reason given by the server: {detail}</p>}
    </section>
  );
}
