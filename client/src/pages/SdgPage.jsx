import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Target } from "lucide-react";
import {
  fetchSdgMeta, fetchSdgSummary, fetchSdgYearly, fetchSdgDistricts,
  fmtInt, fmtCompact, fmtMoney, fmtRange, fmtPct, NO_DATA,
} from "../lib/sdgApi";
import { Banner, Segmented, StatCard, Section } from "../components/sdg/Ui";
import DistrictTable from "../components/sdg/DistrictTable";
import YearBars from "../components/sdg/YearBars";
import ChainTab from "../components/sdg/ChainTab";
import DistrictMap from "../components/sdg/DistrictMap";
import FlowIntro from "../components/sdg/FlowIntro";
import RegionFloodMaps from "../components/sdg/RegionFloodMaps";
import GuidedFlow from "../components/sdg/GuidedFlow";
import NeedDemModal from "../components/sdg/NeedDemModal";
import { readPayload, clearPayload } from "../lib/flowPayload";

const TABS = [
  { id: "chain", label: "Place chain" },
  { id: "region", label: "Flood maps" },
  { id: "sdg2", label: "SDG 2 Zero Hunger" },
  { id: "sdg11", label: "SDG 11 Resilient Communities" },
  { id: "sdg12", label: "SDG 12 Land and Production" },
  { id: "funding", label: "Funding need" },
  { id: "about", label: "Assumptions and limits" },
];
const COUNTRIES = [{ id: "IND", label: "India" }, { id: "NPL", label: "Nepal (Terai)" }];
const BOUNDS = [{ id: "lower_unflagged", label: "Conservative" }, { id: "upper_union", label: "Upper" }];

export default function SdgPage() {
  const [payload] = useState(readPayload);          // set by "Continue" in New Inputs (DEM engine), used once
  const [mode, setMode] = useState(payload ? "flow" : "intro");   // intro | flow | explore
  const [seed, setSeed] = useState(payload);
  const [needDem, setNeedDem] = useState(false);       // shown when someone tries an action before running the DEM engine
  const goNewInputs = () => window.dispatchEvent(new CustomEvent("app-navigate", { detail: "new-inputs" }));
  const tryAction = (run) => () => { if (payload) { setNeedDem(false); run(); } else setNeedDem(true); };
  useEffect(() => { clearPayload(); }, []);
  // The app is a fixed-height screen. Keep the browser window itself from scrolling (a tall 3D canvas can otherwise push the whole app up and leave blank space).
  useEffect(() => {
    const h = document.documentElement, b = document.body, ph = h.style.overflow, pb = b.style.overflow;
    h.style.overflow = "hidden"; b.style.overflow = "hidden"; window.scrollTo(0, 0);
    return () => { h.style.overflow = ph; b.style.overflow = pb; };
  }, []);
  const chainPoint = null;
  const [tab, setTab] = useState("funding");
  const [view, setView] = useState("simple");
  const [country, setCountry] = useState("IND");
  const [year, setYear] = useState("ever");
  const [bound, setBound] = useState("upper_union");
  const [coveredOnly, setCoveredOnly] = useState(true);

  const meta = useQuery({ queryKey: ["sdg-meta"], queryFn: fetchSdgMeta });
  const summary = useQuery({ queryKey: ["sdg-summary", country, year, coveredOnly], queryFn: () => fetchSdgSummary({ country, year, covered_only: coveredOnly }) });
  const yearly = useQuery({ queryKey: ["sdg-yearly", country, coveredOnly], queryFn: () => fetchSdgYearly({ country, covered_only: coveredOnly }) });
  const sortFor = { sdg2: "cropland", sdg11: "people", funding: "need" };
  const districts = useQuery({
    queryKey: ["sdg-districts", country, year, bound, coveredOnly, tab],
    queryFn: () => fetchSdgDistricts({ country, year, bound, covered_only: coveredOnly, sort: sortFor[tab] ?? "people", limit: 15 }),
    enabled: ["sdg2", "sdg11", "funding"].includes(tab),
  });

  const s = summary.data;
  const cur = s?.currency;
  const lo = s?.bounds?.lower_unflagged;
  const up = s?.bounds?.upper_union;
  const sel = s?.bounds?.[bound];
  const isNepal = country === "NPL";

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-ink-950 text-ink-100">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-7">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-signal-teal/15 flex items-center justify-center">
            <Target size={18} className="text-signal-teal" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight text-white">SDG Impact</h1>
            <p className="text-[13.5px] text-ink-200">Observed floods, people, cropland and estimated recovery need. India and Nepal Terai.</p>
          </div>
          {mode === "explore" && (
            <button onClick={() => setMode("intro")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3.5 py-2 text-[13.5px] font-medium text-ink-100 hover:text-white"><ArrowLeft size={13} /> Guide</button>
          )}
        </div>

        {mode === "intro" && (
          <>
            <FlowIntro onStart={tryAction(() => { setSeed(payload); setMode("flow"); })} onExplore={tryAction(() => setMode("explore"))} />
            {needDem && <NeedDemModal onGo={goNewInputs} />}
          </>
        )}
        {mode === "flow" && <GuidedFlow seed={seed} meta={meta.data} onExit={() => { setSeed(null); setMode("intro"); }} />}
        {mode === "explore" && <>
        <div className="mt-4">
          <Banner>
            {meta.data?.label ?? "Estimated recovery need from observed flood exposure. Not a forecast. Not a release decision."}
          </Banner>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!["chain", "region"].includes(tab) && <Segmented options={COUNTRIES} value={country} onChange={setCountry} />}
          {!["chain", "region"].includes(tab) && <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-[13px] text-ink-100"
          >
            <option value="ever">Ever flooded 2019-2026</option>
            {(meta.data?.years ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>}
          {["sdg2", "sdg11", "funding"].includes(tab) && <Segmented options={BOUNDS} value={bound} onChange={setBound} />}
          <Segmented options={[{ id: "simple", label: "Simple" }, { id: "technical", label: "Technical" }]} value={view} onChange={setView} />
          {!["chain", "region"].includes(tab) && (
            <label className="flex items-center gap-1.5 text-[13px] text-ink-200">
              <input type="checkbox" checked={coveredOnly} onChange={(e) => setCoveredOnly(e.target.checked)} />
              Only districts with 99%+ satellite coverage
            </label>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-ink-700/60">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[14px] font-medium border-b-2 -mb-px ${
                tab === t.id ? "border-signal-teal text-white" : "border-transparent text-ink-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(summary.isError || meta.isError) && (
          <div className="mt-4"><Banner tone="amber">The SDG API did not answer. Start the server and check that the SDG tables exist (etl/sdg). Nothing is shown instead of guessing.</Banner></div>
        )}
        {s && !["chain", "region"].includes(tab) && (
          <p className="mt-3 text-[12.5px] text-ink-300">
            {s.districts_total - s.districts_left_out} of {s.districts_total} districts shown
            {coveredOnly && s.districts_left_out > 0 ? `; ${s.districts_left_out} left out for partial satellite coverage` : ""}.
            Only the part of each district inside the study region is counted.
          </p>
        )}

        {tab === "region" && <div className="mt-5"><RegionFloodMaps /></div>}
        {tab === "chain" && <ChainTab initialPoint={chainPoint ? { lat: chainPoint.lat, lng: chainPoint.lng } : null} technical={view === "technical"} meta={meta.data} />}

        {tab === "sdg2" && s && (
          <>
            <Section title="Cropland in the observed flood footprint" note="WorldCover 2021 cropland (class 40) inside observed flood extent. Exposure, not crop loss.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Cropland flooded (ha)" value={fmtInt(sel?.cropland_ha_exposed)} sub={`${fmtPct(sel?.district_cropland_ha ? (100 * sel.cropland_ha_exposed) / sel.district_cropland_ha : null)} of cropland in these districts`} />
                <StatCard label="Range across bounds" value={fmtRange(lo?.cropland_ha_exposed, up?.cropland_ha_exposed, fmtInt)} sub="Conservative to upper (ha)" />
                <StatCard
                  label="Crop input subsidy need"
                  value={isNepal ? NO_DATA : fmtRange(sel?.crop_min, sel?.crop_max, (v) => fmtMoney(v, cur))}
                  noData={isNepal}
                  sub={isNepal ? "The Nepal 2077 standard has no crop rate. No number is made up." : "Ceiling: applies only where crop loss is 33% or more."}
                />
              </div>
            </Section>
            <Section title="Map of districts"><DistrictMap metric="cropland" year={year} bound={bound} coveredOnly={coveredOnly} country={country} /></Section>
            <Section title="Districts with the most cropland flooded"><DistrictTable rows={districts.data?.rows} kind="sdg2" /></Section>
          </>
        )}

        {tab === "sdg11" && s && (
          <>
            <Section title="People and buildings in the observed flood footprint" note="WorldPop 2020 modelled population and VIDA building footprints. Exposure, not casualties or damage.">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <StatCard label="People exposed" value={fmtInt(sel?.people_exposed)} sub={`${fmtPct(sel?.district_pop ? (100 * sel.people_exposed) / sel.district_pop : null)} of people in these districts`} />
                <StatCard label="Households (est.)" value={fmtRange(sel?.households_min, sel?.households_max, fmtInt)} sub={isNepal ? "Household size 4.37 (national census 2021)" : "Household size 5 to 6 (assumed, not verified)"} />
                <StatCard label="Buildings exposed" value={fmtInt(sel?.buildings_exposed)} sub={sel?.buildings_exposed == null ? `Building footprints cover only ${sel?.buildings_districts_with_data ?? 0} of ${sel?.districts ?? 0} districts here, so no total is given.` : "Footprints, not damage. Cross-check only."} noData={sel?.buildings_exposed == null} />
                <StatCard label="Housing ceiling" value={fmtMoney(sel?.housing_ceiling, cur)} sub="If every exposed household lost its house. Shown separately, never added to the need." />
              </div>
            </Section>
            <Section title="Map of districts"><DistrictMap metric="people" year={year} bound={bound} coveredOnly={coveredOnly} country={country} /></Section>
            <Section title="Districts with the most people exposed"><DistrictTable rows={districts.data?.rows} kind="sdg11" /></Section>
          </>
        )}

        {tab === "sdg12" && (
          <Section title="Land and production (SDG 12)">
            <StatCard label="Slope, land cover and erosion" value={NO_DATA} noData sub="Not computed yet. Planned: slope from the corrected DEM and land cover only. No erosion or soil-loss claims will be made." />
          </Section>
        )}

        {tab === "funding" && s && (
          <>
            <Section title="Estimated recovery need" note={`Relief cash per household${isNepal ? "" : " plus crop input subsidy"}. ${isNepal ? "Nepal crops: no documented rate, so not included." : ""}`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Conservative bound" value={fmtRange(lo?.need_min, lo?.need_max, (v) => fmtMoney(v, cur))} sub="Unflagged scenes only; min to max over unit-cost and household-size ranges" />
                <StatCard label="Upper bound" value={fmtRange(up?.need_min, up?.need_max, (v) => fmtMoney(v, cur))} sub="Unflagged plus flagged scenes" />
                <StatCard label="In INR (upper bound)" value={fmtRange(up?.need_min_inr, up?.need_max_inr, (v) => fmtMoney(v, "INR"))} sub={isNepal ? "Nepal amounts converted at 1.60 NPR per INR (Nepal Rastra Bank fixed rate, 21 Oct 2026)" : "Native currency"} />
              </div>
            </Section>
            <Section title="By year" note="Each year counts places flooded at least once that year. The ever-flooded figure is a combined footprint, not the sum of years.">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <YearBars rows={yearly.data?.rows ?? []} field="people_exposed" format={fmtCompact} title="People exposed" />
                <YearBars rows={yearly.data?.rows ?? []} field="need_max_inr" format={(v) => fmtMoney(v, "INR")} title="Need, max (INR)" />
              </div>
            </Section>
            <Section title="Map of districts"><DistrictMap metric="need" year={year} bound={bound} coveredOnly={coveredOnly} country={country} /></Section>
            <Section title="Districts with the highest need (selected bound, max)"><DistrictTable rows={districts.data?.rows} kind="funding" /></Section>
          </>
        )}

        {tab === "about" && meta.data && (
          <>
            <Section title="Limits you should know"><ul className="list-disc pl-5 space-y-1.5 text-[13px] text-ink-100">{meta.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Section>
            <Section title="Unit costs and assumptions" note="Status shows how well each value is checked.">
              <div className="overflow-x-auto rounded-xl border border-ink-700/60">
                <table className="w-full text-[13.5px]">
                  <thead className="bg-ink-850/80 text-ink-200"><tr><th className="text-left px-4 py-3 text-[13px] font-medium">Item</th><th className="text-left px-4 py-3 text-[13px] font-medium">Value</th><th className="text-left px-4 py-3 text-[13px] font-medium">Source</th><th className="text-left px-4 py-3 text-[13px] font-medium">Status</th></tr></thead>
                  <tbody>
                    {Object.entries(meta.data.assumptions).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).flatMap(([group, items]) =>
                      group === "inr_to_npr"
                        ? [[group, "Exchange rate (NPR per INR)", items]]
                        : Object.entries(items).filter(([, v]) => v && typeof v === "object").map(([k, v]) => [`${group} ${k}`, `${group}: ${k.replaceAll("_", " ")}`, v])
                    ).map(([key, label, v]) => (
                      <tr key={key} className="border-t border-ink-700/50 align-top">
                        <td className="px-4 py-2.5 text-white">{label}</td>
                        <td className="px-4 py-2.5 tabular-nums">{v.value ?? [v.low, v.high].filter((x) => x != null).join(" to ")}</td>
                        <td className="px-4 py-2.5 text-ink-200">{v.source ?? v.what ?? ""}</td>
                        <td className="px-4 py-2.5 text-signal-amber">{v.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <p className="mt-4 text-[12.5px] text-ink-300">{meta.data.region}</p>
          </>
        )}
        </>}
      </div>
    </div>
  );
}
