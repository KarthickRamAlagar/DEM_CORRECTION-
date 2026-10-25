import { fmtDay } from "../../lib/dateFmt";

// Shown at step 1 of the flow when the run was started from a river forecast, a chosen forecast day or a replayed past day (patches 13 and 13c).
// Says which day, date and year the run is for. A river forecast or replay is not a flood map.
export default function ForecastBadge({ seed }) {
  const f = seed?.forecast; if (!f) return null;
  const replay = f.kind === "replay";
  return (
    <div className="mt-6 rounded-xl border border-signal-teal/50 bg-ink-850/60 p-4" role="note">
      <p className="text-[15px] font-semibold text-white">{f.title ?? `This run is for ${fmtDay(f.date)}`}</p>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-200">{f.text ?? `River forecast issued ${fmtDay(f.issued)}. On the forecast day (day ${f.lead_days}) the river flow is ${f.level === "expected" ? "expected" : "possible"} to be ${(f.tierLabel ?? "").toLowerCase()}. The river rise below is set to ${f.riseM} m, a planning assumption for that level. You can change it.`}</p>
      <p className="mt-1 text-[13px] text-ink-400">{replay ? "A replay, not a forecast, and not a flood map." : "A river forecast, not a flood map."} Everything after this step is exposure and an estimated recovery need, not a release decision. You can change the river rise below.</p>
    </div>
  );
}
