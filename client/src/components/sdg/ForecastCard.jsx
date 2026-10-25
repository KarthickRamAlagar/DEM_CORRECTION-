import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import { fetchForecastPoint, fetchReplay, fetchReplayStatus } from "../../lib/forecastApi";
import { fmtDay, fmtShort } from "../../lib/dateFmt";
import { NO_DATA } from "../../lib/sdgApi";
import { Banner } from "./Ui";

// River forecast for the place (patch 13). Source: GloFAS ensemble through /api/sdg/forecast/point. Every date is shown with weekday, day, month and year.
// It is a forecast of river flow at the nearest large river cell, NOT a flood map. The flood map and the people / crops / recovery need still come from the SDG flow.
const nf = (v) => (v == null ? NO_DATA : Math.round(v).toLocaleString("en-IN"));
const pc = (v) => (v == null ? NO_DATA : `${Math.round(v * 100)}%`);
const LEVEL = {
  expected: { icon: CircleAlert, tone: "border-signal-amber/70", word: "Expected" },
  possible: { icon: CircleHelp, tone: "border-signal-amber/50", word: "Possible" },
  not_indicated: { icon: CircleCheck, tone: "border-signal-teal/60", word: "Not indicated" },
};

function Chart({ s, tiers, hover, setHover }) {
  const W = 720, H = 220, L = 52, R = 12, T = 12, B = 30;
  const xs = (i) => L + (i / Math.max(1, s.length - 1)) * (W - L - R);
  const hi = Math.max(...s.map((r) => r.q_p90 ?? 0), tiers.rl2?.flow_m3s ? tiers.rl2.flow_m3s * 1.1 : 0, 1);
  const ys = (v) => T + (1 - v / hi) * (H - T - B);
  const pts = (k) => s.map((r, i) => `${xs(i).toFixed(1)},${ys(r[k] ?? 0).toFixed(1)}`);
  const band = [...pts("q_p90"), ...pts("q_p10").reverse()].join(" ");
  const ticks = s.map((r, i) => [r, i]).filter(([, i]) => i % 5 === 0 || i === s.length - 1);
  const lines = ["rl2", "rl5", "rl20"].filter((k) => tiers[k]?.flow_m3s != null && tiers[k].flow_m3s <= hi);
  const onMove = (e) => { const b = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - b.left) / b.width) * W; setHover(Math.max(0, Math.min(s.length - 1, Math.round(((x - L) / (W - L - R)) * (s.length - 1))))); };
  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="River flow forecast for the next days: middle value with the 10th to 90th percentile range, and the flood-level lines" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={ys(hi * f)} y2={ys(hi * f)} stroke="currentColor" className="text-ink-700" strokeWidth="1" /><text x={L - 6} y={ys(hi * f) + 4} textAnchor="end" className="fill-ink-300" fontSize="9.5">{nf(hi * f)}</text></g>)}
      <polygon points={band} fill="#14b8a6" opacity="0.22" />
      {lines.map((k, n) => <g key={k}><line x1={L} x2={W - R} y1={ys(tiers[k].flow_m3s)} y2={ys(tiers[k].flow_m3s)} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray={n === 0 ? "5 4" : n === 1 ? "2 3" : "8 3 2 3"} /><text x={W - R - 2} y={ys(tiers[k].flow_m3s) - 4} textAnchor="end" className="fill-ink-200" fontSize="9.5">{k === "rl2" ? "1 in 2 years" : k === "rl5" ? "1 in 5 years" : "1 in 20 years"}</text></g>)}
      <polyline points={pts("q_p50").join(" ")} fill="none" stroke="#14b8a6" strokeWidth="2" />
      {hover != null && <g><line x1={xs(hover)} x2={xs(hover)} y1={T} y2={H - B} stroke="currentColor" className="text-ink-400" /><circle cx={xs(hover)} cy={ys(s[hover].q_p50 ?? 0)} r="4" fill="#14b8a6" stroke="#0b1220" strokeWidth="2" /></g>}
      {ticks.map(([r, i]) => <text key={r.date} x={xs(i)} y={H - 10} textAnchor={i === s.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="fill-ink-300" fontSize="9.5">{fmtShort(r.date)}</text>)}
    </svg>
    </div>
  );
}

export default function ForecastCard({ point, onResult, onRunFlow }) {
  const q = useQuery({ queryKey: ["fc-point", point?.lat, point?.lng], queryFn: () => fetchForecastPoint({ lat: point.lat, lon: point.lng }), enabled: !!point, retry: 0, staleTime: 10 * 60 * 1000 });
  const d = q.data; const [hover, setHover] = useState(null); const [table, setTable] = useState(false);
  const summary = useMemo(() => (d?.found && d.focus ? { date: d.focus.date, weekday: d.focus.weekday, year: d.focus.year, lead_days: d.focus.lead_days, tier: d.focus.tier, tierLabel: d.tiers[d.focus.tier].label, riseM: d.focus.assumed_river_rise_m, level: d.alert.level, issued: d.issue.date } : null), [d]);
  useEffect(() => { onResult?.(summary); }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!point) return null;
  const lv = d?.found ? LEVEL[d.alert.level] : null; const Icon = lv?.icon; const s = d?.series ?? [];
  const h = hover != null ? s[hover] : null; const last = s[s.length - 1];
  return (
    <>
    <section aria-labelledby="fc-h" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-5">
      <h3 id="fc-h" className="text-[16px] font-semibold text-white">River forecast for this place (GloFAS): which day, date and year</h3>
      {q.isLoading && <p className="mt-2 text-[13px] text-ink-300">Loading the river forecast...</p>}
      {q.isError && <div className="mt-2"><Banner tone="amber">{q.error.message}</Banner></div>}
      {d && (
        <>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-300">Forecast issued <strong className="text-ink-100">{fmtDay(d.issue.date)}</strong>, {d.members} ensemble members{last ? `, covering ${fmtDay(s[0].date)} to ${fmtDay(last.date)}` : ""}. Each date is the day the 24-hour flow window ends (UTC). This is river flow at the nearest large river, not a flood map.</p>
          {!d.found ? <div className="mt-3"><Banner>{d.reason}</Banner></div> : (
            <>
              <div className={`mt-3 rounded-xl border ${lv.tone} bg-ink-850/60 p-4`}>
                <div className="flex items-start gap-3">
                  <Icon size={22} aria-hidden className="mt-0.5 shrink-0 text-signal-amber" />
                  <div>
                    <p className="text-[15px] font-semibold text-white">{d.alert.tier === "rl2" ? "High river flow" : "River flood-level flow"}: {lv.word.toLowerCase()}</p>
                    {d.focus ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-100">{d.alert.label} {d.alert.level === "expected" ? "is expected from" : "is possible from"} <strong>{fmtDay(d.focus.date)}</strong> (day {d.focus.lead_days} of the forecast). Chance at any time in the 30 days: {pc(d.tiers[d.alert.tier].chance_any_day)}.</p>
                    ) : <p className="mt-1 text-[13px] leading-relaxed text-ink-100">No flood-level river flow is indicated up to {fmtDay(last?.date)}. This is not a promise of no flood: local rain and small streams are not in this forecast.</p>}
                    {d.river_cell.small_river && <p className="mt-2 text-[13px] text-signal-amber">This is a small river (mean flow {nf(d.river_cell.mean_flow_m3s)} m³/s). A forecast for it says little about flooding at this place.</p>}
                    <p className="mt-1 text-[13px] text-ink-400">River point used: one of the largest rivers within 15 km ({d.river_cell.river_cells_within_radius} river cells checked, the closest of the biggest taken), at {d.river_cell.lat?.toFixed(2)} N, {d.river_cell.lon?.toFixed(2)} E, {d.river_cell.distance_km} km from your place, mean flow {nf(d.river_cell.mean_flow_m3s)} m³/s.</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-ink-700/70 p-3">
                <p className="min-h-[2.6em] text-[13px] text-ink-200" aria-live="polite">{h ? `${fmtDay(h.date)}, day ${h.lead_days}: middle ${nf(h.q_p50)} m³/s (10th to 90th percentile ${nf(h.q_p10)} to ${nf(h.q_p90)}). Chance above the 1-in-2 / 1-in-5 / 1-in-20-year flow: ${pc(h.p_rl2)} / ${pc(h.p_rl5)} / ${pc(h.p_rl20)}.` : "Move over the chart to read a day. Flow is in m³/s. The teal line is the middle of the 51 members, the band is the 10th to 90th percentile, the dashed lines are flood levels."}</p>
                <Chart s={s} tiers={d.tiers} hover={hover} setHover={setHover} />
                <button type="button" onClick={() => setTable((v) => !v)} className="mt-2 text-[13px] text-signal-teal underline underline-offset-2">{table ? "Hide the table" : "Show the table"}</button>
                {table && (
                  <div className="mt-2 max-h-72 overflow-auto">
                    <table className="w-full min-w-[620px] text-left text-[13px]">
                      <caption className="sr-only">Forecast river flow by day</caption>
                      <thead className="sticky top-0 bg-ink-850 text-ink-200"><tr><th scope="col" className="px-2 py-1">Day and date</th><th scope="col" className="px-2 py-1">Lead</th><th scope="col" className="px-2 py-1">Middle (m³/s)</th><th scope="col" className="px-2 py-1">10th to 90th</th><th scope="col" className="px-2 py-1">1 in 2</th><th scope="col" className="px-2 py-1">1 in 5</th><th scope="col" className="px-2 py-1">1 in 20</th></tr></thead>
                      <tbody>{s.map((r) => <tr key={r.date} className="border-t border-ink-700/50 text-ink-100"><th scope="row" className="px-2 py-1 font-medium">{fmtDay(r.date)}</th><td className="px-2 py-1 tabular-nums">{r.lead_days}</td><td className="px-2 py-1 tabular-nums">{nf(r.q_p50)}</td><td className="px-2 py-1 tabular-nums">{nf(r.q_p10)} to {nf(r.q_p90)}</td><td className="px-2 py-1 tabular-nums">{pc(r.p_rl2)}</td><td className="px-2 py-1 tabular-nums">{pc(r.p_rl5)}</td><td className="px-2 py-1 tabular-nums">{pc(r.p_rl20)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <caption className="sr-only">Flood levels, chance, first day and the river rise assumed for the what-if</caption>
                  <thead className="bg-ink-850/70 text-ink-200"><tr><th scope="col" className="px-3 py-2 font-medium">Level</th><th scope="col" className="px-3 py-2 font-medium">Flow (m³/s)</th><th scope="col" className="px-3 py-2 font-medium">Chance in 30 days</th><th scope="col" className="px-3 py-2 font-medium">First day it is expected</th><th scope="col" className="px-3 py-2 font-medium">First day it is possible</th><th scope="col" className="px-3 py-2 font-medium">River rise used (assumed)</th></tr></thead>
                  <tbody>{["rl2", "rl5", "rl20"].map((k) => { const t = d.tiers[k]; return <tr key={k} className="border-t border-ink-700/50 text-ink-100"><th scope="row" className="px-3 py-2 font-medium">{t.label}</th><td className="px-3 py-2 tabular-nums">{nf(t.flow_m3s)}</td><td className="px-3 py-2 tabular-nums">{pc(t.chance_any_day)}</td><td className="px-3 py-2">{t.first_expected ? fmtDay(t.first_expected.date) : "Not reached"}</td><td className="px-3 py-2">{t.first_possible ? fmtDay(t.first_possible.date) : "Not reached"}</td><td className="px-3 py-2 tabular-nums">{t.assumed_river_rise_m} m</td></tr>; })}</tbody>
                </table>
              </div>
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-400">{d.status} {d.caveats.join(" ")}</p>

              {d.focus && onRunFlow && (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => onRunFlow({ lat: point.lat, lng: point.lng, forecast: summary })} className="inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-5 py-2.5 text-[13px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal">
                    Run the SDG flow for {fmtDay(d.focus.date)} <ArrowRight size={15} aria-hidden />
                  </button>
                  <span className="max-w-xl text-[13px] text-ink-300">Uses a {d.focus.assumed_river_rise_m} m river rise, a planning assumption for river flow {d.tiers[d.focus.tier].label.toLowerCase()}. Ends with the estimated recovery need, not a release decision.</span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
    <DaySection point={point} d={d?.found ? d : null} why={q.isError ? "unavailable" : d && !d.found ? "no_river" : null} onRunFlow={onRunFlow} />
    </>
  );
}

// ---- Day picker (patch 13c): choose any forecast day, or a past day (replay), and run the same SDG flow for it. ----
const RISES = [1, 2, 3, 4, 6, 8];
const pickTier = (r) => ["rl20", "rl5", "rl2"].find((k) => (r?.[`p_${k}`] ?? 0) >= 0.2) ?? null;
const BTN = "inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-5 py-2.5 text-[13px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal";
const SEL = "rounded-lg border border-ink-700/70 bg-ink-900 px-3 py-2 text-[13px] text-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal";

function RiseSelect({ value, onChange, note }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-200">River rise for the what-if
      <select className={SEL} value={value} onChange={(e) => onChange(Number(e.target.value))}>{[...new Set([...RISES, value])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r} m</option>)}</select>
      <span className="text-[13px] text-ink-400">{note}</span>
    </label>
  );
}

function DaySection({ point, d, why, onRunFlow }) {
  const [mode, setMode] = useState("forecast"); const [fcDay, setFcDay] = useState(null); const [past, setPast] = useState(""); const [rise, setRise] = useState(null); const [hover, setHover] = useState(null);
  const rs = useQuery({ queryKey: ["fc-replay-status"], queryFn: fetchReplayStatus, retry: 0, staleTime: 60 * 60 * 1000 });
  const monthOk = /^\d{4}-(0[6-9]|10)-\d{2}$/.test(past);
  const rp = useQuery({ queryKey: ["fc-replay", point?.lat, point?.lng, past], queryFn: () => fetchReplay({ lat: point.lat, lon: point.lng, day: past }), enabled: !!point && mode === "past" && monthOk, retry: 0 });
  const series = d?.series ?? [];
  const day = fcDay ?? d?.focus?.date ?? d?.peak_median_flow?.date ?? series[0]?.date;
  const row = series.find((r) => r.date === day);
  if (!point) return null;
  const fTier = row ? pickTier(row) : null; const r = rp.data?.found ? rp.data : null;
  const defRise = mode === "forecast" ? (fTier ? d.tiers[fTier].assumed_river_rise_m : 2) : (r?.tier ? r.assumed_river_rise_m : 2); const useRise = rise ?? defRise;
  const riseNote = rise != null ? "your choice" : (mode === "forecast" ? fTier : r?.tier) ? "planning assumption for that flood level" : "no flood-level flow that day, so this is your choice";
  const runForecast = () => {
    const lvl = fTier ? ((row[`p_${fTier}`] ?? 0) >= 0.5 ? "expected" : "possible") : "not_indicated"; const tl = fTier ? d.tiers[fTier].label : null;
    onRunFlow({ lat: point.lat, lng: point.lng, forecast: { kind: "forecast", date: row.date, weekday: row.weekday, year: row.year, lead_days: row.lead_days, tier: fTier, tierLabel: tl, riseM: useRise, level: lvl, issued: d.issue.date,
      title: `This run is for ${fmtDay(row.date)}`,
      text: `River forecast issued ${fmtDay(d.issue.date)}; you chose day ${row.lead_days}. The model's middle flow that day is ${nf(row.q_p50)} m³/s (10th to 90th percentile ${nf(row.q_p10)} to ${nf(row.q_p90)}). ${fTier ? `Chance of flow ${tl.toLowerCase()}: ${pc(row[`p_${fTier}`])}.` : "No flood-level flow is indicated for that day."} The river rise is set to ${useRise} m (${riseNote}).` } });
  };
  const runPast = () => onRunFlow({ lat: point.lat, lng: point.lng, forecast: { kind: "replay", date: r.date.date, weekday: r.date.weekday, year: r.date.year, lead_days: null, tier: r.tier, tierLabel: r.tier_label, riseM: useRise, level: "replay", issued: null,
    title: `This run is for ${fmtDay(r.date.date)} (a past day)`,
    text: `A replay of the river model's own history, not a forecast. On that day the modelled river flow was ${nf(r.flow_m3s)} m³/s, ${r.tier ? r.tier_label.toLowerCase() : "below the 1-in-2-year flow, so not at flood level"}. The river rise is set to ${useRise} m (${riseNote}).` } });
  const cs = r ? r.series.map((x) => ({ date: x.date, q_p10: x.q, q_p50: x.q, q_p90: x.q })) : [];
  const ct = r ? { rl2: { flow_m3s: r.levels_m3s.rl2 }, rl5: { flow_m3s: r.levels_m3s.rl5 }, rl20: { flow_m3s: r.levels_m3s.rl20 } } : {};
  const hr = hover != null ? r?.series[hover] : null;
  return (
    <section aria-labelledby="dp-h" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-5">
      <h3 id="dp-h" className="text-[16px] font-semibold text-white">Pick a day and run the SDG flow</h3>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-300">Choose one of the 30 forecast days, or a past day to replay a flood that already happened. There is no day-by-day answer beyond 30 days; the season outlook above covers that.</p>
      <div className="mt-3 inline-flex rounded-lg border border-ink-700/70 p-0.5" role="group" aria-label="Kind of day">
        {[["forecast", "A forecast day (next 30 days)"], ["past", "A past day (replay)"]].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => { setMode(id); setRise(null); }} className={`rounded-md px-3 py-1.5 text-[13px] ${mode === id ? "bg-ink-800 text-white" : "text-ink-300 hover:text-white"}`}>{label}</button>
        ))}
      </div>

      {mode === "forecast" && (!d ? <div className="mt-3"><Banner>{why === "no_river" ? "There is no large river within 15 km of this place, so there are no forecast days and no past days to replay. Click a place nearer a river." : "The river forecast is not available (see above), so there are no forecast days to pick. A past-day replay can still work if the river history is downloaded."}</Banner></div> : (
        <div className="mt-4 space-y-3">
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-200">Forecast day
            <select className={SEL} value={day} onChange={(e) => { setFcDay(e.target.value); setRise(null); }}>{series.map((x) => <option key={x.date} value={x.date}>{fmtDay(x.date)} (day {x.lead_days})</option>)}</select>
          </label>
          {row && <p className="max-w-3xl text-[13px] leading-relaxed text-ink-100"><strong>{fmtDay(row.date)}</strong>, day {row.lead_days} of the forecast issued {fmtDay(d.issue.date)}: middle flow {nf(row.q_p50)} m³/s (10th to 90th percentile {nf(row.q_p10)} to {nf(row.q_p90)}). Chance of reaching the 1-in-2 / 1-in-5 / 1-in-20-year flow that day: {pc(row.p_rl2)} / {pc(row.p_rl5)} / {pc(row.p_rl20)}.</p>}
          <RiseSelect value={useRise} onChange={setRise} note={riseNote} />
          <div><button type="button" className={BTN} onClick={runForecast}>Run the SDG flow for {fmtDay(row?.date)} <ArrowRight size={15} aria-hidden /></button></div>
        </div>
      ))}

      {mode === "past" && (
        <div className="mt-4 space-y-3">
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-200">Past day
            <input type="date" className={SEL} value={past} min={rs.data?.from} max={rs.data?.to} onChange={(e) => { setPast(e.target.value); setRise(null); }} />
            <span className="text-[13px] text-ink-400">{rs.data?.available ? `June to October, ${rs.data.years[0]} to ${rs.data.years[rs.data.years.length - 1]}` : "River history not downloaded yet"}</span>
          </label>
          {rs.isError && <Banner tone="amber">{rs.error.message}</Banner>}
          {past && !monthOk && <Banner>Only June to October days are available.</Banner>}
          {monthOk && rp.isLoading && <p className="text-[13px] text-ink-300">Reading the river history...</p>}
          {monthOk && rp.isError && <Banner tone="amber">{rp.error.message}</Banner>}
          {monthOk && rp.data && !rp.data.found && <Banner>{rp.data.reason}</Banner>}
          {r && (
            <>
              {r.river_cell.small_river && <p className="text-[13px] text-signal-amber">This is a small river (mean flow {nf(r.river_cell.mean_flow_m3s)} m³/s). A replay for it says little about flooding at this place.</p>}
              <p className="max-w-3xl text-[13px] leading-relaxed text-ink-100"><strong>{fmtDay(r.date.date)}</strong>: the river model had the flow at {nf(r.flow_m3s)} m³/s ({r.times_rl2 != null ? `${r.times_rl2} times` : "compared with"} the 1-in-2-year flow). {r.tier ? `That is ${r.tier_label.toLowerCase()}.` : "That is below the 1-in-2-year flow, so not at flood level."} River point: {r.river_cell.lat?.toFixed(2)} N, {r.river_cell.lon?.toFixed(2)} E, {r.river_cell.distance_km} km away, mean flow {nf(r.river_cell.mean_flow_m3s)} m³/s.</p>
              <div className="rounded-xl border border-ink-700/70 p-3">
                <p className="min-h-[1.6em] text-[13px] text-ink-200" aria-live="polite">{hr ? `${fmtDay(hr.date)}: ${nf(hr.q)} m³/s.` : "Ten days either side of the chosen day. Move over the chart to read a day."}</p>
                <Chart s={cs} tiers={ct} hover={hover} setHover={setHover} />
              </div>
              <RiseSelect value={useRise} onChange={setRise} note={riseNote} />
              <p className="max-w-3xl text-[13px] leading-relaxed text-ink-400">{r.caveats.join(" ")}</p>
              <div><button type="button" className={BTN} onClick={runPast}>Run the SDG flow for {fmtDay(r.date.date)} (replay) <ArrowRight size={15} aria-hidden /></button></div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
