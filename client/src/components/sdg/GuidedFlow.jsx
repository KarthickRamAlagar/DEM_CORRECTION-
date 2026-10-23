import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Download, Lock } from "lucide-react";
import { fetchScenario, fetchPointCheck, fetchCropContext, fetchAdmin1, fetchScene, fetchRegionMaps, fmtInt, fmtMoney, fmtRange, fmtPct, NO_DATA } from "../../lib/sdgApi";
import { FLOW_STEPS } from "../../lib/flowSteps";
import { buildPlaceReport, reportFileName } from "../../lib/placeReport";
import { loadEvalData } from "../../lib/evalData";
import { Banner, Segmented, Figures, DataTable, SdgChip, Tabs } from "./Ui";
import EmptyState from "./EmptyState";
import { NutritionPanel, EconPanels, CropPanel, nutritionFigure, econFigures, cropFigure } from "./ContextPanels";
import MapTabs from "./MapTabs";
import PointOutlook from "./PointOutlook";
import ForecastBadge from "./ForecastBadge";
import { forecastLabel } from "../../lib/dateFmt";
import MapDescription from "./MapDescription";
import AmountReveal from "./AmountReveal";
import RegionFloodMaps from "./RegionFloodMaps";
import { Curve } from "./ChainTab";

const View3D = lazy(() => import("./View3D"));
const Lazy3D = (props) => (<Suspense fallback={<p className="mt-4 text-[14px] text-ink-300">Loading the 3D view...</p>}><View3D {...props} /></Suspense>);

const RADII = [{ id: 5, label: "5 km" }, { id: 10, label: "10 km" }, { id: 20, label: "20 km" }];
const LAST = FLOW_STEPS.length - 1;
const m2 = (v) => (v == null ? NO_DATA : `${v.toFixed(2)} m`);
const fmtAmount = (v, cur) => `${cur === "NPR" ? "NPR " : "₹"}${Math.round(v).toLocaleString("en-IN")}`;
const DOT = { flooded: "#2563eb", dry: "#64748b", uncertain: "#f59e0b" };
const kindOf = (s) => (s.startsWith("flooded") ? "flooded" : s.startsWith("dry") ? "dry" : "uncertain");

const btnPrimary = "inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-5 py-2.5 text-[14px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal disabled:opacity-40 disabled:cursor-not-allowed";
const btnQuiet = "inline-flex items-center gap-2 rounded-lg border border-ink-600 px-4 py-2.5 text-[14px] font-medium text-ink-100 hover:text-white hover:border-ink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal disabled:opacity-40 disabled:cursor-not-allowed";

const Tech = ({ on, children }) => (on ? <div className="mt-5 rounded-lg border border-ink-700/60 bg-ink-850/60 p-4 text-[13px] leading-relaxed text-ink-200 max-w-3xl">{children}</div> : null);
const Heading = ({ children }) => <h3 className="mt-8 mb-3 text-[16px] font-semibold text-white">{children}</h3>;

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-300">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-white break-words tabular-nums">{value}</dd>
    </div>
  );
}

function PointCard({ pq, seed, rise }) {
  if (!seed || seed.rawZ == null || seed.correctedZ == null) return null;
  if (pq.isError) return <div className="mt-8"><Banner tone="amber">Point check: {pq.error.message}</Banner></div>;
  const p = pq.data;
  if (!p) return <p className="mt-8 text-[13.5px] text-ink-300">Checking the point...</p>;
  const a = p.adjusted;
  return (
    <div>
      <Heading>The point from the DEM engine</Heading>
      <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <Fact label="Raw elevation" value={m2(p.elevation.raw)} />
          <Fact label="Corrected elevation" value={`${m2(p.elevation.corrected)} (${p.elevation.shift >= 0 ? "+" : ""}${p.elevation.shift.toFixed(2)} m)`} />
          <Fact label="Height above the nearest river" value={a ? (a.has_interval ? `${m2(a.low)} to ${m2(a.high)}` : m2(a.mid)) : NO_DATA} />
          <Fact label={`If the river rises ${rise} m`} value={p.status ?? NO_DATA} />
        </dl>
        {p.message && <p className="mt-4 text-[13.5px] text-signal-amber">{p.message}</p>}
        {p.by_rise.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2 list-none p-0">
            {p.by_rise.map((r) => (
              <li key={r.rise} title={r.status} className="inline-flex items-center gap-2 rounded-full border border-ink-700/70 px-3 py-1 text-[13px] text-ink-100">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT[kindOf(r.status)] }} />
                {r.rise} m: {kindOf(r.status)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-ink-300 max-w-3xl">
          Satellites saw this ~90 m cell flooded in {p.observed_years.lower} to {p.observed_years.upper} of {p.observed_years.of} years (2019-2026). {p.notes[0]}
        </p>
      </div>
    </div>
  );
}

function Sidebar({ idx, maxIdx, started, locked, onGo, onCancel, confirmCancel, setConfirmCancel, onExit, summary }) {
  return (
    <aside className="lg:sticky lg:top-4 self-start">
      <div className="lg:hidden mb-4">
        <div className="text-[13px] text-ink-300">Step {idx + 1} of {FLOW_STEPS.length}</div>
        <div className="mt-2 h-1.5 rounded-full bg-ink-800"><div className="h-full rounded-full bg-signal-teal" style={{ width: `${((idx + 1) / FLOW_STEPS.length) * 100}%` }} /></div>
      </div>
      <nav aria-label="Flow steps" className="hidden lg:block">
        <ol className="relative list-none p-0 m-0">
          <span aria-hidden className="absolute left-[13px] top-3 bottom-3 w-px bg-ink-700" />
          {FLOW_STEPS.map((s, i) => {
            const state = i === idx ? "current" : i <= maxIdx ? "done" : "todo";
            const disabled = state === "todo" || (started && i === 0);
            return (
              <li key={s.id} className="relative">
                <button type="button" onClick={() => onGo(i)} disabled={disabled} aria-current={i === idx ? "step" : undefined}
                  className={`group flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal ${disabled ? "cursor-default" : "hover:bg-ink-850/70"}`}>
                  <span className={`relative z-10 mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${
                    state === "current" ? "border-signal-teal bg-signal-teal text-ink-950" : state === "done" ? "border-signal-teal/70 bg-ink-900 text-signal-teal" : "border-ink-600 bg-ink-900 text-ink-300"}`}>
                    {state === "done" ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[14px] leading-snug ${state === "current" ? "font-semibold text-white" : state === "done" ? "text-ink-100" : "text-ink-300"}`}>{s.title}</span>
                    {s.sdg && <span className="mt-0.5 block"><SdgChip goal={s.sdg} /></span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {locked && (
        <div className="mt-5 rounded-xl border border-ink-700/60 bg-ink-900/50 p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-white"><Lock size={13} /> Inputs are locked</div>
          <dl className="mt-3 space-y-2">
            {summary.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 text-[13px]"><dt className="text-ink-300">{k}</dt><dd className="text-right text-ink-100 tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-4">
        {!confirmCancel ? (
          <button type="button" onClick={() => (locked && idx < LAST ? setConfirmCancel(true) : onExit())} className="text-[13.5px] text-ink-300 underline underline-offset-4 hover:text-white">
            {locked && idx < LAST ? "Cancel this flow" : "Return to the SDG guide"}
          </button>
        ) : (
          <div className="rounded-lg border border-signal-amber/60 bg-ink-850/70 p-3 text-[13px] text-ink-100">
            Leave and lose this run?
            <div className="mt-2 flex gap-4">
              <button type="button" onClick={onCancel} className="font-medium text-signal-amber underline underline-offset-4">Yes, cancel</button>
              <button type="button" onClick={() => setConfirmCancel(false)} className="underline underline-offset-4">Keep going</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function GuidedFlow({ seed, meta, onExit }) {
  const fromDem = !!seed && seed.from === "dem-engine";
  const [point, setPoint] = useState(seed ? { lat: seed.lat, lng: seed.lng } : null);
  const [radius, setRadius] = useState(10);
  const [rise, setRise] = useState(seed?.riseM ?? 2);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [maxIdx, setMaxIdx] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [technical, setTechnical] = useState(false);
  const [floodTab, setFloodTab] = useState("maps");
  const [reveal, setReveal] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [revealSeen, setRevealSeen] = useState(false);

  const q = useQuery({
    queryKey: ["flow-scn", point?.lat, point?.lng, radius, rise],
    queryFn: () => fetchScenario({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: rise }),
    enabled: started && !!point, retry: 0,
  });
  const hasZ = !!seed && seed.rawZ != null && seed.correctedZ != null;
  const pq = useQuery({
    queryKey: ["flow-pt", point?.lat, point?.lng, rise, seed?.rawZ, seed?.correctedZ, seed?.zLo, seed?.zHi],
    queryFn: () => fetchPointCheck({ lat: point.lat, lon: point.lng, raw_z: seed.rawZ, corrected_z: seed.correctedZ, rise_m: rise, ...(seed.zLo != null ? { z_lo: seed.zLo, z_hi: seed.zHi } : {}) }),
    enabled: started && hasZ && !!point, retry: 0,
  });
  const d = q.data;
  const cropQ = useQuery({ queryKey: ["crop-ctx"], queryFn: fetchCropContext, retry: 0 });
  const admQ = useQuery({ queryKey: ["adm1", point?.lat, point?.lng], queryFn: () => fetchAdmin1({ lat: point.lat, lon: point.lng }), enabled: started && !!point, retry: 0 });
  const focus = admQ.data?.key ?? null;
  const iso = d?.here?.iso ?? admQ.data?.iso ?? "IND";
  const noRiver = !!d && d.river_height_coverage?.corrected === 0;
  const blocked = started && idx >= 1 && (q.isError || noRiver);
  const c = d?.scenario.corrected, r = d?.scenario.raw, mc = d?.money.corrected, mr = d?.money.raw;
  const hh = (k) => (mc?.by_country.length ? mc.by_country.reduce((s, x) => s + x[k], 0) : null);

  const go = (i) => { if (i >= 0 && i <= Math.min(maxIdx, LAST) && !(started && i === 0)) { setIdx(i); window.scrollTo?.(0, 0); } };
  const next = () => {
    if (idx === 0) { if (!point) return; setStarted(true); }
    const n = Math.min(idx + 1, LAST);
    setIdx(n); setMaxIdx((m) => Math.max(m, n));
  };
  const back = () => go(idx - 1);

  // warn before closing the tab mid-flow
  useEffect(() => {
    if (!(started && idx < LAST)) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [started, idx]);

  useEffect(() => { if (started && idx === 5 && d && !blocked && mc?.by_country?.length && !revealSeen) { setReveal(true); setRevealSeen(true); } }, [started, idx, d, blocked, revealSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = FLOW_STEPS[idx];
  const nextStep = FLOW_STEPS[Math.min(idx + 1, LAST)];
  const summary = [
    ["Place", d?.here ? `${d.here.name} (${d.here.iso})` : point ? `${point.lat.toFixed(3)} N, ${point.lng.toFixed(3)} E` : NO_DATA],
    ["River rise", `${rise} m (what-if)`],
    ["Circle", `${radius} km`],
    ["Raw elevation", seed?.rawZ != null ? m2(seed.rawZ) : NO_DATA],
    ["Corrected elevation", seed?.correctedZ != null ? m2(seed.correctedZ) : NO_DATA],
    ["Model range", seed?.zLo != null ? `${m2(seed.zLo)} to ${m2(seed.zHi)}` : NO_DATA],
  ];

  const finding = (() => {
    if (blocked) return "";
    if (idx === 0) return fromDem ? "Your elevation result is loaded and locked. Choose how far the river rises, then start." : "Choose a place on the map, then set the scenario.";
    if (!d) return q.isError ? "" : "Working out the numbers...";
    if (idx === 1) return `If the river rose ${rise} m, about ${fmtInt(c.flooded_km2)} km² inside the ${radius} km circle would be under water. This is a what-if from terrain height, not a forecast.`;
    if (idx === 2) return c.people == null ? "No population data for this place." : `About ${fmtInt(c.people)} people live on land that would be under water. This counts exposure, not casualties or damage.`;
    if (idx === 3) return hh("households_min") == null ? "No household estimate for this place." : `Roughly ${fmtRange(hh("households_min"), hh("households_max"), fmtInt)} households live there, with ${fmtInt(c.cropland_ha)} hectares of cropland under water.`;
    if (idx === 4) return `${fmtInt(c.cropland_ha)} hectares of cropland would be under water, ${fmtPct(d.circle.cropland_ha ? (100 * c.cropland_ha) / d.circle.cropland_ha : null)} of the cropland in the circle.`;
    if (idx === 5) return mc.need_min_inr == null ? "No recovery estimate for this place." : `Estimated recovery need: ${fmtRange(mc.need_min_inr, mc.need_max_inr, (v) => fmtMoney(v, "INR"))}. An estimate for planning, not a release decision.`;
    return "Your place report is ready to download.";
  })();

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-x-10 gap-y-2">
      <Sidebar idx={idx} maxIdx={maxIdx} started={started} locked={started} onGo={go} summary={summary}
        confirmCancel={confirmCancel} setConfirmCancel={setConfirmCancel} onCancel={onExit} onExit={onExit} />

      <main className="min-w-0 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-semibold leading-tight text-white">{step.title}</h2>
            {step.sdg && <div className="mt-1.5"><SdgChip goal={step.sdg} /></div>}
          </div>
          <Segmented label="Detail level" options={[{ id: "simple", label: "Simple" }, { id: "technical", label: "Technical" }]} value={technical ? "technical" : "simple"} onChange={(v) => setTechnical(v === "technical")} />
        </div>
        {finding && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-100">{finding}</p>}

        {blocked && (() => {
          const msg = q.isError ? q.error.message : "";
          const outside = /outside/i.test(msg);
          const facts = [
            ["Place", point ? `${point.lat.toFixed(4)} N, ${point.lng.toFixed(4)} E` : NO_DATA],
            ...(seed?.rawZ != null ? [["Raw elevation", m2(seed.rawZ)]] : []),
            ...(seed?.correctedZ != null ? [["Corrected elevation", m2(seed.correctedZ)]] : []),
            ...(seed?.zLo != null ? [["Model range", `${m2(seed.zLo)} to ${m2(seed.zHi)}`]] : []),
          ];
          const acts = [{ label: "Choose another place", primary: true, back: true, onClick: onExit }];
          if (noRiver) return (
            <div className="mt-6"><EmptyState emoji="☀️" title="No river near this place" facts={facts} actions={acts}>
              No mapped river lies close enough to give a height above the river, so there is nothing to flood in this what-if. The elevation result is still valid. To try another place, run the DEM engine again in New Inputs.
            </EmptyState></div>
          );
          if (outside) return (
            <div className="mt-6"><EmptyState emoji="🧭" title="This place is outside the river-height layer" facts={facts} actions={acts} detail={msg}>
              The flood what-if needs a river-height value, and that layer does not reach this place, so no flood, people or money numbers are given. Nothing is guessed. The elevation result from the DEM engine is still valid.
            </EmptyState></div>
          );
          return (
            <div className="mt-6"><EmptyState emoji="🛰️" title="The numbers could not be worked out" facts={facts} actions={acts} detail={msg}>
              The server did not return a result for this place. Nothing is guessed. Check that the API is running, then choose the place again.
            </EmptyState></div>
          );
        })()}

        {idx === 0 && (
          <div className="mt-6">
            {fromDem ? (
              <dl className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5 rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
                <Fact label="Place" value={`${point.lat.toFixed(4)} N, ${point.lng.toFixed(4)} E`} />
                <Fact label="Raw elevation" value={m2(seed.rawZ)} />
                <Fact label="Corrected elevation" value={m2(seed.correctedZ)} />
                <Fact label="Model range for the corrected elevation" value={seed.zLo != null ? `${m2(seed.zLo)} to ${m2(seed.zHi)}` : NO_DATA} />
                <Fact label="Date entered" value={seed.date ?? NO_DATA} />
              </dl>
            ) : (
              <MapTabs point={point} radiusKm={radius} onPick={setPoint} />
            )}
            <ForecastBadge seed={seed} />
            <PointOutlook point={point} seed={seed} rise={rise} />
            <h3 className="mt-8 mb-3 text-[16px] font-semibold text-white">Scenario settings</h3>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <label className="flex items-center gap-3 text-[14px] text-ink-100">
                River rises by
                <input type="range" min="0.5" max="8" step="0.5" value={rise} onChange={(e) => setRise(Number(e.target.value))} />
                <span className="w-14 text-white tabular-nums">{rise} m</span>
              </label>
              <div className="flex items-center gap-3 text-[14px] text-ink-100">Circle around the place <Segmented label="Circle size" options={RADII} value={radius} onChange={setRadius} /></div>
            </div>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-300">The DEM engine does not predict a river rise, so this is a setting you choose (default 2 m). Both settings lock when you start.</p>
          </div>
        )}

        {!blocked && idx === 1 && d && (
          <>
            <div className="mt-6">
              <Figures items={[
                { label: "Under water, corrected DEM", value: `${fmtInt(c.flooded_km2)} km²`, sub: `${fmtPct((100 * c.flooded_km2) / d.circle.area_km2)} of the circle` },
                { label: "Under water, raw DEM", value: `${fmtInt(r.flooded_km2)} km²`, sub: "Measured flood-extent skill was not different" },
                { label: "Seen by satellite, 2019 to 2026", value: fmtRange(d.observed.lower.flooded_km2, d.observed.upper.flooded_km2, (v) => `${fmtInt(v)} km²`), sub: `Up to ${d.observed.max_years_upper} of 8 years in places` },
              ]} />
            </div>
            {c.flooded_km2 === 0 && (
              <div className="mt-5">
                <EmptyState compact emoji="🏔️" title={`Nothing is under water at ${rise} m`}>
                  At this river rise no land inside the {radius} km circle is below the water line. The settings are locked for this run; start a new run to test a higher rise.
                </EmptyState>
              </div>
            )}
            <div className="mt-8">
              <Tabs label="Flood page sections" value={floodTab} onChange={setFloodTab}
                tabs={[{ id: "maps", label: "Flood maps" }, { id: "view3d", label: "3D view" }, { id: "point", label: "Your point" }, { id: "graphs", label: "Graphs" }]} />
            </div>
            <div role="tabpanel" aria-labelledby={`tab-${floodTab}`} className="pt-2">
              {floodTab === "maps" && (
                <>
                  <Heading>How the correction changes the flood map</Heading>
                  <p className="mb-4 max-w-3xl text-[14px] leading-relaxed text-ink-200">The same river rise, run on the raw elevation model and on the corrected one, across the Nepal Terai and the Indian plains beside it. The maps show where the correction moves the water line.</p>
                  <RegionFloodMaps point={point} radiusKm={radius} defaultRise={rise} defaultCountry={d.here?.iso === "IND" ? "IND" : "NPL"} />
                  <Heading>Around your place</Heading>
                  <MapTabs point={point} radiusKm={radius} overlay={d.overlay} />
                  <MapDescription d={d} />
                </>
              )}
              {floodTab === "view3d" && (
                <>
                  <Heading>See the flood in 3D</Heading>
                  <p className="max-w-3xl text-[14px] leading-relaxed text-ink-200">Buildings, people and crops on the terrain, with the same river rise run on the raw and the corrected elevation model. Use Compare to see where the two disagree.</p>
                  <Lazy3D point={point} rise={rise} seedRadius={Math.min(radius, 3)} />
                </>
              )}
              {floodTab === "point" && (hasZ ? <PointCard pq={pq} seed={seed} rise={rise} /> : <p className="mt-8 max-w-2xl text-[14px] leading-relaxed text-ink-200">This run did not start from a DEM engine result, so there is no corrected elevation to check against the river. Start from New Inputs to see the point check.</p>)}
              {floodTab === "graphs" && (
                <>
                  <Heading>How the numbers grow as the river rises</Heading>
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <Curve curve={d.curve} rise={rise} />
                    <Curve curve={d.curve} rise={rise} field="people" title="People on flooded land as the river rises" yLabel="people" />
                  </div>
                  <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-ink-300">Teal is the corrected DEM and amber is the raw DEM. The dotted line marks the river rise you chose. These are what-if curves from terrain height, not forecasts, and people counts are exposure, not casualties.</p>
                </>
              )}
            </div>
            <Tech on={technical}>HAND (height above nearest drainage) from the 2022 raw and corrected DEM at 1 arc-second. Cells are flooded when HAND is at or below {rise} m inside the {radius} km circle. River-height coverage: corrected {fmtPct(100 * d.river_height_coverage.corrected)}, raw {fmtPct(100 * d.river_height_coverage.raw)}. No discharge, embankments, bridges, rainfall or time are modelled.</Tech>
          </>
        )}

        {!blocked && idx === 2 && d && (
          <>
            <div className="mt-6">
              <Figures items={[
                { label: "People exposed", value: fmtInt(c.people), sub: `${fmtPct(d.circle.people ? (100 * c.people) / d.circle.people : null)} of people in the circle. Raw DEM: ${fmtInt(r.people)}` },
                { label: "Built-up land", value: `${fmtInt(c.builtup_ha)} ha`, sub: "ESA WorldCover 2021" },
                { label: "Buildings exposed", value: fmtInt(c.buildings), noData: c.buildings == null, sub: c.buildings == null ? "Footprints do not cover the whole circle, so no total is given" : "Footprints, not damage" },
              ]} />
            </div>
            <p className="mt-4 text-[14px] text-ink-200">Seen flooded by satellite in the circle: {fmtRange(d.observed.lower.people, d.observed.upper.people, fmtInt)} people in at least one year from 2019 to 2026 (conservative to upper).</p>
            {d.districts.length > 0 && (
              <>
                <Heading>Districts touched</Heading>
                <DataTable caption="Districts touched and people exposed" rows={d.districts} rowKey={(x) => x.name + x.iso}
                  columns={[{ key: "n", label: "District", render: (x) => `${x.name} (${x.iso === "IND" ? "India" : "Nepal"})` }, { key: "p", label: "People exposed", align: "right", render: (x) => fmtInt(x.people) }]} />
              </>
            )}
            <Heading>Buildings and people in 3D</Heading>
            <Lazy3D point={point} rise={rise} defaultLayer="buildings" seedRadius={Math.min(radius, 3)} />
            <Tech on={technical}>People: WorldPop 2020 constrained (modelled) times the flooded fraction of each cell. Buildings: VIDA footprints, shown only where they cover the whole circle. A 2020 snapshot is used for every scenario.</Tech>
          </>
        )}

        {!blocked && idx === 3 && d && (
          <>
            <div className="mt-6">
              <Figures items={[
                { label: "Households exposed (estimate)", value: fmtRange(hh("households_min"), hh("households_max"), fmtInt), noData: hh("households_min") == null, sub: "India 5 to 6 persons per household (assumed, not verified). Nepal 4.37 (census 2021)" },
                { label: "Cropland under water", value: `${fmtInt(c.cropland_ha)} ha`, sub: "Exposure, not crop loss" },
                nutritionFigure(iso, focus),
              ]} />
            </div>
            <Heading>Child nutrition where this place lies</Heading>
            {!focus && <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-ink-300">The state or province of this place could not be looked up, so every row is shown. Build the boundaries with etl/sdg/fetch_adm1.py to mark yours.</p>}
            <NutritionPanel iso={iso} focus={focus} />
            <Tech on={technical}>Households = people divided by household size (etl/sdg/funding_config.json). Nutrition values are published survey figures for the whole state or province and are not scaled down to this place. Nothing about hunger is modelled.</Tech>
          </>
        )}

        {!blocked && idx === 4 && d && (
          <>
            <div className="mt-6">
              <Figures items={[
                { label: "Cropland under water", value: `${fmtInt(c.cropland_ha)} ha`, sub: `Raw DEM: ${fmtInt(r.cropland_ha)} ha` },
                { label: "Seen flooded by satellite", value: fmtRange(d.observed.lower.cropland_ha, d.observed.upper.cropland_ha, (v) => `${fmtInt(v)} ha`), sub: "At least one year, 2019 to 2026" },
                cropFigure(iso, cropQ.data, c.cropland_ha),
              ]} />
            </div>
            <Heading>Crop yield</Heading>
            <CropPanel iso={iso} ha={c.cropland_ha} />
            <Heading>Cropland in 3D</Heading>
            <Lazy3D point={point} rise={rise} defaultLayer="crops" seedRadius={Math.min(radius, 3)} />
            <Tech on={technical}>Cropland is the ESA WorldCover 2021 class 40 share of each cell times the cell area. Production loss is not estimated. The rice value is hectares under water times a state yield from the APY table times the minimum support price, so it is a ceiling. It is not a loss estimate.</Tech>
          </>
        )}

        {reveal && mc?.by_country?.length > 0 && <AmountReveal countries={mc.by_country} totalInr={{ min: mc.need_min_inr, max: mc.need_max_inr }} onClose={() => setReveal(false)} />}
        {!blocked && idx === 5 && d && (
          <>
            {mc?.by_country?.length > 0 && <div className="mt-4"><button type="button" onClick={() => setReveal(true)} className="rounded-lg border border-ink-600 px-3.5 py-2 text-[13.5px] font-medium text-ink-100 hover:text-white">Show the amount again</button></div>}
            <div className="mt-6">
              <Figures items={[
                { label: "Need, corrected DEM (INR)", value: fmtRange(mc.need_min_inr, mc.need_max_inr, (v) => fmtMoney(v, "INR")), noData: mc.need_min_inr == null, sub: "Lowest to highest over the unit-cost ranges" },
                { label: "Need, raw DEM (INR)", value: fmtRange(mr.need_min_inr, mr.need_max_inr, (v) => fmtMoney(v, "INR")), noData: mr.need_min_inr == null, sub: "Sensitivity check" },
                { label: "Housing ceiling, not added", value: fmtMoney(mc.housing_ceiling_inr, "INR"), sub: "If every exposed household lost its house" },
              ]} />
            </div>
            {mc.by_country.length > 0 && (
              <>
                {!technical && (
                  <>
                    <Heading>In plain words</Heading>
                    <p className="text-[15px] leading-relaxed text-ink-100 max-w-3xl">
                      About {fmtRange(mc.by_country.reduce((s, x) => s + x.households_min, 0), mc.by_country.reduce((s, x) => s + x.households_max, 0), fmtInt)} households sit on land that would be under water. Helping them would need about {fmtRange(mc.need_min_inr, mc.need_max_inr, (v) => fmtMoney(v, "INR"))}. This is an estimate for planning, not a forecast and not a release decision. Switch to Technical to see how it is worked out.
                    </p>
                    <Heading>By country</Heading>
                    <DataTable caption="Estimated recovery need by country" rows={mc.by_country} rowKey={(x) => x.iso}
                      columns={[
                        { key: "c", label: "Country", render: (x) => (x.iso === "IND" ? "India" : "Nepal") },
                        { key: "h", label: "Households", align: "right", render: (x) => fmtRange(x.households_min, x.households_max, fmtInt) },
                        { key: "ni", label: "Need, INR", align: "right", render: (x) => fmtRange(x.need_min_inr, x.need_max_inr, (v) => fmtMoney(v, "INR")) },
                      ]} />
                  </>
                )}
                {technical && (
                  <>
                    <Heading>By country, every part</Heading>
                    <DataTable caption="Estimated recovery need by country, with each cost part" rows={mc.by_country} rowKey={(x) => x.iso}
                      columns={[
                        { key: "c", label: "Country", render: (x) => (x.iso === "IND" ? "India" : "Nepal") },
                        { key: "h", label: "Households", align: "right", render: (x) => fmtRange(x.households_min, x.households_max, fmtInt) },
                        { key: "rc", label: "Relief cash", align: "right", render: (x) => fmtRange(x.relief_min, x.relief_max, (v) => fmtMoney(v, x.currency)) },
                        { key: "cs", label: "Crop subsidy", align: "right", render: (x) => (x.crop_min == null ? NO_DATA : fmtRange(x.crop_min, x.crop_max, (v) => fmtMoney(v, x.currency))) },
                        { key: "nl", label: "Need, local currency", align: "right", render: (x) => fmtRange(x.need_min, x.need_max, (v) => fmtMoney(v, x.currency)) },
                        { key: "ni", label: "Need, INR", align: "right", render: (x) => fmtRange(x.need_min_inr, x.need_max_inr, (v) => fmtMoney(v, "INR")) },
                      ]} />
                    <Heading>How the amount is worked out</Heading>
                    <div className="rounded-lg border border-ink-700/60 bg-ink-850/60 p-4 text-[13.5px] leading-relaxed text-ink-100 max-w-3xl space-y-2">
                      <p><span className="font-medium text-white">Households</span> = people under water divided by household size.</p>
                      <p><span className="font-medium text-white">Need</span> = households times relief cash per household, plus cropland hectares under water times the crop input subsidy (India only).</p>
                      <p><span className="font-medium text-white">Housing</span> is a separate ceiling and is not added to the need.</p>
                      <p><span className="font-medium text-white">Corrected against raw:</span> the same scenario on the raw DEM needs {fmtRange(mr.need_min_inr, mr.need_max_inr, (v) => fmtMoney(v, "INR"))}, so the gap shows how much the correction changes the amount.</p>
                    </div>
                    <Heading>Unit costs and their status</Heading>
                    <DataTable caption="Unit costs used and how well sourced each one is" rows={mc.by_country} rowKey={(x) => x.iso}
                      columns={[
                        { key: "c", label: "Country", render: (x) => (x.iso === "IND" ? "India" : "Nepal") },
                        { key: "hs", label: "Household size", render: (x) => x.status.household_size },
                        { key: "rs", label: "Relief cash", render: (x) => x.status.relief },
                        { key: "cr", label: "Crop subsidy", render: (x) => x.status.crop },
                      ]} />
                    {meta?.assumptions && (
                      <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink-200 max-w-3xl list-none p-0">
                        <li>Exchange rate: 1 INR = {meta.assumptions.inr_to_npr?.value} NPR. Status: {meta.assumptions.inr_to_npr?.status}.</li>
                        {["IND", "NPL"].map((k) => { const a = meta.assumptions[k]; if (!a) return null; const hs = a.household_size, rc = a.relief_cash_per_household;
                          return <li key={k}>{k === "IND" ? "India" : "Nepal"}: household size {hs.low === hs.high ? hs.low : `${hs.low} to ${hs.high}`} ({hs.status}); relief cash per household {rc.value ?? `${rc.low} to ${rc.high}`} {a.currency} ({rc.status}).</li>; })}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
            <Heading>Spending, poverty and output context</Heading>
            <Figures items={[
              { label: "Relief cash per household", value: mc.by_country[0] ? fmtRange(mc.by_country[0].relief_min / mc.by_country[0].households_min, mc.by_country[0].relief_max / mc.by_country[0].households_max, (v) => fmtAmount(v, mc.by_country[0].currency)) : NO_DATA, noData: !mc.by_country[0], sub: "The scenario's own unit cost" },
              ...econFigures(iso, focus),
            ]} />
            <div className="mt-6"><EconPanels iso={iso} focus={focus} /></div>
            <Tech on={technical}>Nepal is converted at 1 INR = 1.60 NPR (Nepal Rastra Bank fixed rate). The India crop subsidy applies only where crop loss is 33% or more, so it is a ceiling. Nepal has no documented crop rate, so Nepal crops are not included. The status words come from the assumptions file.</Tech>
          </>
        )}

        {!blocked && idx === LAST && (
          <div className="mt-6 max-w-2xl">
            <p className="text-[14px] leading-relaxed text-ink-200">The PDF takes you from {fromDem ? "your DEM engine result" : seed?.forecast ? "the river forecast day you chose" : "the place you chose"} through the flood scenario, people and buildings, land and crops, to the micro and macro economics, then the model evaluation, with the method notes and developer footer on the last page.</p>
            <div className="mt-5">
              {d ? (
                <button type="button" onClick={async () => {
                  setPdfBusy(true);
                  try {
                    const [scene, region] = await Promise.all([
                      fetchScene({ lat: point.lat, lon: point.lng, radius_km: Math.min(3, radius), rise_m: rise }).catch(() => null),
                      fetchRegionMaps({ rise_m: rise, country: iso === "IND" ? "IND" : "NPL" }).catch(() => null),
                    ]);
                    const evalData = await loadEvalData();
                    const doc = await buildPlaceReport({ data: d, meta, scene, region, evalData,
                      dem: seed ? { lat: seed.lat, lng: seed.lng, rawZ: seed.rawZ, correctedZ: seed.correctedZ, zLo: seed.zLo, zHi: seed.zHi, date: seed.date, inputs: seed.inputs, engine: seed.engine, forecast: seed.forecast ? { label: forecastLabel(seed.forecast) } : null } : null,
                      extra: { nutrition: nutritionFigure(iso, focus), crop: cropFigure(iso, cropQ.data, c.cropland_ha), econ: econFigures(iso, focus) } });
                    doc.save(reportFileName(d));
                  } finally { setPdfBusy(false); }
                }} disabled={pdfBusy} className={btnPrimary}>
                  <Download size={16} /> {pdfBusy ? "Preparing the PDF..." : "Download DEM-AREA-SDG report (PDF)"}
                </button>
              ) : <Banner tone="amber">There is no result to put in a report.</Banner>}
            </div>
            <p className="mt-4 text-[13.5px] text-ink-300">The whole-region DEM Correction Report and SDG Report come next.</p>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-ink-700/60 pt-5">
          <button type="button" onClick={back} disabled={idx <= 1} className={btnQuiet}><ArrowLeft size={16} /> Back</button>
          {idx < LAST ? (
            <button type="button" onClick={next} disabled={(idx === 0 && !point) || (idx > 0 && (!d || blocked))} className={btnPrimary}>
              {idx === 0 ? "Start the flow" : `Next: ${nextStep.title}`} <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={onExit} className={btnPrimary}>Finish</button>
          )}
        </div>
      </main>
    </div>
  );
}
