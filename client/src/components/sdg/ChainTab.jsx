import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { fetchScenario, fmtInt, fmtCompact, fmtMoney, fmtRange, fmtPct, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented, StatCard, Section } from "./Ui";
import MapTabs from "./MapTabs";
import { buildPlaceReport } from "../../lib/placeReport";

const STEPS = [
  { id: "flood", label: "1 Flood" },
  { id: "people", label: "2 People and crops" },
  { id: "house", label: "3 Households and hunger" },
  { id: "money", label: "4 Money" },
  { id: "report", label: "5 Report" },
];
const RADII = [{ id: 5, label: "5 km" }, { id: 10, label: "10 km" }, { id: 20, label: "20 km" }];

export function Curve({ curve, rise, field = "flooded_km2", title = "Flooded area (km²) as the river rises", yLabel = "km²" }) {
  const val = (c, k) => c[k][field] ?? 0;
  const maxY = Math.max(1, ...curve.flatMap((c) => [val(c, "corrected"), val(c, "raw")]));
  const maxX = curve[curve.length - 1].rise;
  const X = (v) => 28 + (v / maxX) * 262, Y = (v) => 108 - (v / maxY) * 94;
  const line = (k) => curve.map((c) => `${X(c.rise)},${Y(val(c, k))}`).join(" ");
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
      <div className="text-[14px] font-medium text-white mb-1">{title}</div>
      <svg viewBox="0 0 300 124" className="w-full">
        <line x1="28" y1="108" x2="292" y2="108" stroke="currentColor" className="text-ink-600" />
        <line x1="28" y1="10" x2="28" y2="108" stroke="currentColor" className="text-ink-600" />
        <polyline points={line("corrected")} fill="none" stroke="#14b8a6" strokeWidth="2" />
        <polyline points={line("raw")} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
        <line x1={X(Math.min(rise, maxX))} y1="10" x2={X(Math.min(rise, maxX))} y2="108" stroke="#facc15" strokeDasharray="2 3" />
        {curve.map((c) => <text key={c.rise} x={X(c.rise)} y="120" fontSize="8" textAnchor="middle" fill="currentColor" className="text-ink-400">{c.rise}</text>)}
        <text x="24" y="14" fontSize="8" textAnchor="end" fill="currentColor" className="text-ink-400">{Math.round(maxY).toLocaleString("en-IN")}</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-ink-300">
        <span><span className="inline-block w-3 h-0.5 bg-signal-teal mr-1 align-middle" />Corrected DEM</span>
        <span><span className="inline-block w-3 h-0.5 bg-signal-amber mr-1 align-middle" />Raw DEM</span>
        <span>x: river rise (m). y: {yLabel}</span>
      </div>
    </div>
  );
}

// full amount, not crore/million (used for per-household values)
const fmtAmount = (v, cur) => `${cur === "NPR" ? "NPR " : "₹"}${Math.round(v).toLocaleString("en-IN")}`;

function Tech({ on, children }) {
  return on ? <div className="mt-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-3 text-[11px] leading-relaxed text-ink-300">{children}</div> : null;
}

export default function ChainTab({ initialPoint, technical, meta }) {
  const [point, setPoint] = useState(initialPoint);
  const [radius, setRadius] = useState(10);
  const [riseInput, setRiseInput] = useState(2);
  const [rise, setRise] = useState(2);
  const [step, setStep] = useState("flood");

  useEffect(() => { const t = setTimeout(() => setRise(riseInput), 350); return () => clearTimeout(t); }, [riseInput]);

  const q = useQuery({
    queryKey: ["sdg-chain", point?.lat, point?.lng, radius, rise],
    queryFn: () => fetchScenario({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: rise }),
    enabled: !!point,
    placeholderData: (prev) => prev,
    retry: 0,
  });
  const d = q.data;
  const c = d?.scenario.corrected, r = d?.scenario.raw, mc = d?.money.corrected, mr = d?.money.raw;
  const hh = (k) => (mc?.by_country.length ? mc.by_country.reduce((s, x) => s + x[k], 0) : null);

  return (
    <div className="mt-4">
      <Banner>{d?.label ?? "What-if scenario from terrain height above the nearest river. Not a forecast. Not a release decision."}</Banner>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-ink-300">Circle around the place</span>
        <Segmented options={RADII} value={radius} onChange={setRadius} />
        <label className="flex items-center gap-2 text-[12px] text-ink-300">
          River rises
          <input type="range" min="0.5" max="8" step="0.5" value={riseInput} onChange={(e) => setRiseInput(Number(e.target.value))} />
          <span className="w-12 font-mono text-ink-100">{riseInput} m</span>
        </label>
        <span className="text-[11px] text-ink-400">{point ? `Place: ${point.lat.toFixed(4)} N, ${point.lng.toFixed(4)} E${d?.here ? ` (${d.here.name}, ${d.here.iso})` : ""}` : "No place chosen yet"}</span>
      </div>

      <div className="mt-3">
        <MapTabs point={point} radiusKm={radius} overlay={d?.overlay} onPick={setPoint} />
      </div>

      {!point && <div className="mt-3"><Banner tone="amber">Click the map inside the dashed box to choose a place, or open this page from "New Inputs" after a prediction.</Banner></div>}
      {q.isError && <div className="mt-3"><Banner tone="amber">{q.error.message}</Banner></div>}
      {d?.clipped_to_layer && <div className="mt-3"><Banner tone="amber">The circle reaches past the river-height layer, so only the part inside it is counted.</Banner></div>}

      <div className="mt-4 flex flex-wrap gap-1 border-b border-ink-700/60">
        {STEPS.map((s) => (
          <button key={s.id} onClick={() => setStep(s.id)} className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px ${step === s.id ? "border-signal-teal text-white" : "border-transparent text-ink-400 hover:text-white"}`}>{s.label}</button>
        ))}
      </div>

      {d && step === "flood" && (
        <>
          <Section title="Flood" note={`If the river rose ${rise} m, about ${fmtInt(c.flooded_km2)} km² inside this circle would be under water. A what-if, not a forecast.`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Flooded area, corrected DEM" value={`${fmtInt(c.flooded_km2)} km²`} sub={`${fmtPct((100 * c.flooded_km2) / d.circle.area_km2)} of the circle`} />
              <StatCard label="Flooded area, raw DEM" value={`${fmtInt(r.flooded_km2)} km²`} sub="Shown as a sensitivity check. Flood-extent skill was not measurably different." />
              <StatCard label="Seen by satellite 2019-2026" value={fmtRange(d.observed.lower.flooded_km2, d.observed.upper.flooded_km2, (v) => `${fmtInt(v)} km²`)} sub={`Flooded in at least one year; up to ${d.observed.max_years_upper} of 8 years in places. Conservative to upper.`} />
            </div>
            <div className="mt-3"><Curve curve={d.curve} rise={rise} /></div>
            <Tech on={technical}>
              HAND (height above nearest drainage) from the 2022 raw and corrected DEM, 1 arc-second; cells flooded when HAND is at or below {rise} m and inside the {radius} km circle.
              River-height coverage inside the circle: corrected {fmtPct(100 * d.river_height_coverage.corrected)}, raw {fmtPct(100 * d.river_height_coverage.raw)}. Cells without a river-height value are never counted as flooded.
              No discharge, embankments, bridges, rainfall or time are modelled.
            </Tech>
          </Section>
        </>
      )}

      {d && step === "people" && (
        <Section title="People and crops" note="Land inside the flooded area. Exposure, not casualties or damage.">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <StatCard label="People exposed" value={fmtInt(c.people)} sub={`${fmtPct(d.circle.people ? (100 * c.people) / d.circle.people : null)} of people in the circle. Raw DEM: ${fmtInt(r.people)}`} />
            <StatCard label="Cropland exposed (ha)" value={fmtInt(c.cropland_ha)} sub={`${fmtPct(d.circle.cropland_ha ? (100 * c.cropland_ha) / d.circle.cropland_ha : null)} of cropland in the circle. Raw DEM: ${fmtInt(r.cropland_ha)}`} />
            <StatCard label="Built-up area (ha)" value={fmtInt(c.builtup_ha)} sub="WorldCover 2021 class 50" />
            <StatCard label="Buildings exposed" value={fmtInt(c.buildings)} noData={c.buildings == null} sub={c.buildings == null ? "Building footprints do not cover the whole circle, so no total is given." : "Footprints, not damage."} />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard label="Satellite-seen floods in the circle (people)" value={fmtRange(d.observed.lower.people, d.observed.upper.people, fmtInt)} sub="At least one year 2019-2026. Conservative to upper." />
            <StatCard label="Satellite-seen floods in the circle (cropland ha)" value={fmtRange(d.observed.lower.cropland_ha, d.observed.upper.cropland_ha, fmtInt)} sub="At least one year 2019-2026." />
          </div>
          {d.districts.length > 0 && (
            <div className="mt-3 rounded-xl border border-ink-700/70 bg-ink-900/60 p-4 text-[12px] text-ink-200">
              <div className="text-[14px] font-medium text-white mb-2">Districts touched (people exposed)</div>
              {d.districts.map((x) => <div key={x.name + x.iso} className="flex justify-between"><span>{x.name} ({x.iso})</span><span className="tabular-nums">{fmtInt(x.people)}</span></div>)}
            </div>
          )}
          <Tech on={technical}>People: WorldPop 2020 constrained (modelled, people per ~90 m cell) x flooded fraction. Cropland: WorldCover 2021 class 40 share x cell area. A 2020 snapshot is used for all scenarios.</Tech>
        </Section>
      )}

      {d && step === "house" && (
        <Section title="Households and hunger (SDG 2)" note="Households are people divided by household size. Land that grows food is the link to hunger.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Households exposed (est.)" value={fmtRange(hh("households_min"), hh("households_max"), fmtInt)} noData={hh("households_min") == null} sub="India 5 to 6 persons per household (assumed, not verified). Nepal 4.37 (national census 2021)." />
            <StatCard label="Food-growing land exposed (ha)" value={fmtInt(c.cropland_ha)} sub="Cropland inside the flooded area. Exposure, not crop loss." />
            <StatCard label="Food insecurity, malnutrition" value={NO_DATA} noData sub="Needs a food-security or livelihoods dataset that has not been added. No number is made up." />
          </div>
          <Tech on={technical}>Households = people / household size (config: etl/sdg/funding_config.json). Crop yield and price data are not yet added, so crop value at risk is not estimated.</Tech>
        </Section>
      )}

      {d && step === "money" && (
        <Section title="Money" note="Estimated recovery need = relief cash per household + crop input subsidy (India). Not a release decision.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Need, corrected DEM" value={fmtRange(mc.need_min_inr, mc.need_max_inr, (v) => fmtMoney(v, "INR"))} noData={mc.need_min_inr == null} sub="Min to max over unit-cost and household-size ranges (INR)" />
            <StatCard label="Need, raw DEM" value={fmtRange(mr.need_min_inr, mr.need_max_inr, (v) => fmtMoney(v, "INR"))} noData={mr.need_min_inr == null} sub="Sensitivity check" />
            <StatCard label="Housing ceiling (not added)" value={fmtMoney(mc.housing_ceiling_inr, "INR")} sub="If every exposed household lost its house" />
          </div>
          {mc.by_country.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700/70">
              <table className="w-full text-[12px]">
                <thead className="bg-ink-900 text-ink-300"><tr>{["Country", "People", "Households", "Relief cash", "Crop subsidy", "Need (min to max)"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {mc.by_country.map((x) => (
                    <tr key={x.iso} className="border-t border-ink-700/50">
                      <td className="px-3 py-1.5">{x.iso === "IND" ? "India" : "Nepal"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtInt(x.people)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtRange(x.households_min, x.households_max, fmtInt)}</td>
                      <td className="px-3 py-1.5">{fmtRange(x.relief_min, x.relief_max, (v) => fmtMoney(v, x.currency))}</td>
                      <td className="px-3 py-1.5">{x.crop_min == null ? NO_DATA : fmtRange(x.crop_min, x.crop_max, (v) => fmtMoney(v, x.currency))}</td>
                      <td className="px-3 py-1.5">{fmtRange(x.need_min, x.need_max, (v) => fmtMoney(v, x.currency))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard label="Micro economics (per household)" value={mc.by_country[0] ? fmtRange(mc.by_country[0].relief_min / mc.by_country[0].households_min, mc.by_country[0].relief_max / mc.by_country[0].households_max, (v) => fmtAmount(v, mc.by_country[0].currency)) : NO_DATA} noData={!mc.by_country[0]} sub={`Relief cash per household (${mc.by_country[0]?.currency ?? ""}). Crop value at risk needs yield and price data not yet added.`} />
            <StatCard label="Macro economics" value={NO_DATA} noData sub="Needs district or state economic output (GDP) data, not yet added. Planned as a labelled scenario comparison." />
          </div>
          <Tech on={technical}>Unit costs, sources and status are in the Assumptions tab. India crop subsidy applies only where crop loss is 33% or more, so it is a ceiling. Nepal has no documented crop rate in the 2077 standard, so Nepal crops are not included.</Tech>
        </Section>
      )}

      {d && step === "report" && (
        <Section title="Report" note="A PDF for this place: page 1 in plain words, page 2 the technical annex (method, assumptions with status, limits).">
          <button
            onClick={() => buildPlaceReport({ data: d, meta }).save(`impact-chain-${d.point.lat.toFixed(3)}N-${d.point.lon.toFixed(3)}E.pdf`)}
            className="inline-flex items-center gap-2 rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-4 py-2 text-[13px] font-medium text-signal-teal hover:bg-signal-teal/20"
          >
            <Download size={15} /> Download place report (PDF)
          </button>
          <p className="mt-3 text-[11px] text-ink-400">The full DEM Correction Report and SDG Report for the whole region come next.</p>
        </Section>
      )}
      {q.isFetching && <p className="mt-2 text-[11px] text-ink-500">Updating...</p>}
    </div>
  );
}
