import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleAlert, CircleHelp } from "lucide-react";
import { fetchPointCheck, fmtInt, fmtRange, NO_DATA } from "../../lib/sdgApi";
import { fetchPointOutlook } from "../../lib/pointOutlookApi";
import { Banner } from "./Ui";

// Step 1 addition (patch 11): "Will it flood?" then "If it floods, what is the corrected ground here?".
// Everything comes from /api/sdg/outlook/point and /api/sdg/chain/point. This is a statistical outlook, not a forecast for the date entered.
const pct = (v) => (v == null ? NO_DATA : `${Math.round(v * 100)}%`);
const m2 = (v) => (v == null ? NO_DATA : `${v.toFixed(2)} m`);
const BAND = {
  likely: { icon: CircleAlert, tone: "border-signal-amber/70", label: "Likely" },
  possible: { icon: CircleHelp, tone: "border-signal-amber/50", label: "Possible" },
  unlikely: { icon: CircleCheck, tone: "border-signal-teal/60", label: "Unlikely" },
};
const kindOf = (s) => (s.startsWith("flooded") ? "flooded" : s.startsWith("dry") ? "dry" : "uncertain");
const DOT = { flooded: "#2563eb", dry: "#64748b", uncertain: "#f59e0b" };

function Fact({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-300">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-white break-words tabular-nums">{value}</dd>
      {sub && <dd className="mt-0.5 text-[12px] text-ink-400">{sub}</dd>}
    </div>
  );
}

export default function PointOutlook({ point, seed, rise }) {
  const hasZ = !!seed && seed.rawZ != null && seed.correctedZ != null;
  const o = useQuery({ queryKey: ["pt-outlook", point?.lat, point?.lng], queryFn: () => fetchPointOutlook({ lat: point.lat, lon: point.lng }), enabled: !!point, retry: 0 });
  const pq = useQuery({
    queryKey: ["pt-outlook-check", point?.lat, point?.lng, seed?.rawZ, seed?.correctedZ, seed?.zLo, seed?.zHi],
    queryFn: () => fetchPointCheck({ lat: point.lat, lon: point.lng, raw_z: seed.rawZ, corrected_z: seed.correctedZ, rise_m: rise, ...(seed.zLo != null ? { z_lo: seed.zLo, z_hi: seed.zHi } : {}) }),
    enabled: !!point && hasZ, retry: 0,
  });
  if (!point) return null;
  const d = o.data; const band = d ? BAND[d.verdict.level] : null; const Icon = band?.icon;
  const dist = d?.district?.bounds; const up = dist?.upper_union, lo = dist?.lower_unflagged;
  const p = pq.data;

  return (
    <div>
      <h3 className="mt-8 mb-3 text-[16px] font-semibold text-white">Will it flood here? Outlook for a typical coming year</h3>
      {o.isError && <Banner tone="amber">{o.error.message} The what-if steps below still work.</Banner>}
      {!d && !o.isError && <p className="text-[13.5px] text-ink-300">Checking the satellite record for this place...</p>}
      {d && (
        <div className={`rounded-xl border-l-[3px] ${band.tone} bg-ink-900/50 p-5`}>
          <div className="flex items-center gap-2 text-[16px] font-semibold text-white"><Icon size={18} aria-hidden /> {band.label}: {d.verdict.text}</div>
          <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Fact label="This spot, satellite record" value={`${d.cell.years_lower === d.cell.years_upper ? d.cell.years_lower : `${d.cell.years_lower} to ${d.cell.years_upper}`} of ${d.cell.of} years flooded`} sub="2019 to 2026, ~90 m cell" />
            <Fact label="Chance in a typical year, this spot" value={d.cell.chance_low == null ? `${pct(d.cell.chance_mid_lower)} to ${pct(d.cell.chance_mid_upper)}` : `${pct(d.cell.chance_low)} to ${pct(d.cell.chance_high)}`} sub="Range, not one number" />
            <Fact label={`District chance${d.here ? ` (${d.here.name})` : ""}`} value={up ? (up.p_flood_low == null ? pct(up.p_flood) : `${pct(up.p_flood_low)} to ${pct(up.p_flood_high)}`) : NO_DATA} sub={up ? `${up.years_with_flooding} of ${up.years_in_record} full years had flooding (upper bound)` : d.outlook_built ? "District not in the outlook (partial satellite coverage)" : "Outlook not built yet"} />
            <Fact label="District people exposed, typical year" value={up ? fmtRange(up.people_p10, up.people_p90, fmtInt) : NO_DATA} sub={up ? `Middle ${fmtInt(up.people_p50)}. Conservative bound: ${lo ? fmtRange(lo.people_p10, lo.people_p90, fmtInt) : NO_DATA}` : null} />
          </dl>
          <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-ink-300">
            {d.verdict.rule} {seed?.date ? `The date you entered (${seed.date}) goes to the DEM engine. It does not change this outlook, because there is no rainfall or river forecast yet; a verdict for one named day needs that forecast (planned next). ` : ""}This is a statistical outlook, not a flood warning.
          </p>
        </div>
      )}

      <h3 className="mt-8 mb-3 text-[16px] font-semibold text-white">If it floods: the corrected ground at this point</h3>
      {!hasZ && d && (d.hand.raw != null || d.hand.corrected != null) && (
        <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
          <dl className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <Fact label="Height above the nearest river, raw DEM" value={m2(d.hand.raw)} />
            <Fact label="Height above the nearest river, corrected DEM" value={m2(d.hand.corrected)} sub={d.hand.raw != null && d.hand.corrected != null ? `${d.hand.corrected - d.hand.raw >= 0 ? "+" : ""}${(d.hand.corrected - d.hand.raw).toFixed(2)} m from the correction` : null} />
            <Fact label="Corrected DEM changes the answer?" value={d.hand.by_rise.some((r) => r.raw_flooded !== r.corrected_flooded) ? "Yes, at some river rises" : "No, same at every rise tested"} />
          </dl>
          <ul className="mt-4 flex flex-wrap gap-2 list-none p-0">
            {d.hand.by_rise.map((r) => (
              <li key={r.rise} className="inline-flex items-center gap-2 rounded-full border border-ink-700/70 px-3 py-1 text-[13px] text-ink-100">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.corrected_flooded ? DOT.flooded : DOT.dry }} />
                River +{r.rise} m: {r.corrected_flooded == null ? NO_DATA : r.corrected_flooded ? "flooded" : "dry"}{r.raw_flooded !== r.corrected_flooded && r.raw_flooded != null ? ` (raw DEM: ${r.raw_flooded ? "flooded" : "dry"})` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-300">From the 2022 river-height rasters, one for the raw DEM and one for the corrected DEM. For the elevation of this exact point with its own model range, run the DEM engine in New Inputs. We do not claim the corrected DEM improves flood prediction.</p>
        </div>
      )}
      {!hasZ && d && d.hand.raw == null && d.hand.corrected == null && <Banner>No mapped river within about 12 km of this spot, so there is no river-height value and no flood status is given. The satellite record above still applies.</Banner>}
      {!hasZ && d && (d.hand.raw != null || d.hand.corrected != null) && <p className="mt-2 text-[12.5px] text-ink-400">Want the elevation from the DEM engine for this exact point? Use New Inputs.</p>}
      {hasZ && pq.isError && <Banner tone="amber">Point check: {pq.error.message}</Banner>}
      {hasZ && !pq.isError && !p && <p className="text-[13.5px] text-ink-300">Checking the point...</p>}
      {hasZ && p && (
        <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Fact label="Raw elevation" value={m2(p.elevation.raw)} />
            <Fact label="Corrected elevation" value={`${m2(p.elevation.corrected)} (${p.elevation.shift >= 0 ? "+" : ""}${p.elevation.shift.toFixed(2)} m)`} sub={seed.zLo != null ? `Model range ${m2(seed.zLo)} to ${m2(seed.zHi)}` : null} />
            <Fact label="Height above the nearest river" value={p.adjusted ? (p.adjusted.has_interval ? `${m2(p.adjusted.low)} to ${m2(p.adjusted.high)}` : m2(p.adjusted.mid)) : NO_DATA} />
            <Fact label="Does the river rise decide it?" value={p.adjusted && p.by_rise.length ? (new Set(p.by_rise.map((r) => kindOf(r.status))).size > 1 ? "Yes, it depends on the rise" : "No, same at every rise tested") : NO_DATA} />
          </dl>
          {p.message && <p className="mt-3 text-[13.5px] text-signal-amber">{p.message}</p>}
          {p.by_rise.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 list-none p-0">
              {p.by_rise.map((r) => (
                <li key={r.rise} title={r.status} className="inline-flex items-center gap-2 rounded-full border border-ink-700/70 px-3 py-1 text-[13px] text-ink-100">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT[kindOf(r.status)] }} />
                  River +{r.rise} m: {kindOf(r.status)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-300">The corrected elevation is the DEM engine's result for this exact point. It decides which river rises cover the spot. We do not claim it improves flood prediction. The steps that follow (people, households, crops, recovery need) use the river rise you choose below.</p>
        </div>
      )}
    </div>
  );
}
