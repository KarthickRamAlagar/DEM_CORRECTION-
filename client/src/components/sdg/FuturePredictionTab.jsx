import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { fetchScenario, fmtInt, fmtRange, fmtMoney, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented } from "./Ui";
import MapTabs from "./MapTabs";
import CoordinateBox from "./CoordinateBox";
import OutlookSection from "./OutlookSection";
import RainSection from "./RainSection";
import ForecastCard from "./ForecastCard";
import LandslideCard from "./LandslideCard";
import PhysicsPilotCard from "./PhysicsPilotCard";
import PointOutlook from "./PointOutlook";

// Future prediction page. A statistical outlook plus the terrain what-if. It is NOT a flood warning and NOT a forecast for a named day.
// Choose a place on the map: the page says how likely flooding is in a typical coming year, what the corrected ground is there, and the what-if ladder.
// "Run the full SDG flow" hands the place to the guided flow (flood maps, people, households, crops, recovery need, report).
// Every number comes from the API. Nothing is computed on this page.
const RISES = [1, 2, 3, 4, 6];
const RADII = [{ id: 5, label: "5 km" }, { id: 10, label: "10 km" }, { id: 15, label: "15 km" }];

const need = (d) => {
  const rows = d?.money?.corrected?.by_country || [];
  if (!rows.length) return null;
  return [rows.reduce((s, x) => s + x.need_min_inr, 0), rows.reduce((s, x) => s + x.need_max_inr, 0)];
};

function Bar({ value, max }) {
  const w = value == null || !max ? 0 : Math.max(2, Math.round((value / max) * 100));
  return <div className="h-1.5 w-full rounded-full bg-ink-800"><div className="h-1.5 rounded-full bg-signal-teal" style={{ width: `${w}%` }} /></div>;
}

export default function FuturePredictionTab({ onStartFlow }) {
  const [point, setPoint] = useState(null);
  const [fc, setFc] = useState(null);
  const [radius, setRadius] = useState(10);
  const qs = useQueries({
    queries: RISES.map((r) => ({
      queryKey: ["sdg-future", point?.lat, point?.lng, radius, r],
      queryFn: () => fetchScenario({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: r }),
      enabled: !!point, staleTime: 5 * 60 * 1000,
    })),
  });
  const loading = qs.some((q) => q.isLoading);
  const failed = qs.find((q) => q.isError);
  const ds = qs.map((q) => q.data);
  const here = ds.find(Boolean)?.here;
  const maxPeople = Math.max(0, ...ds.map((d) => d?.scenario?.corrected?.people ?? 0));

  return (
    <div className="mt-5">
      <OutlookSection />
      <RainSection />

      <h3 className="mt-10 text-[16px] font-semibold text-white">Pick a place: will it flood, and what is the corrected ground there?</h3>
      <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-300">Click the map. You get the chance of flooding at that spot in a typical coming year, the corrected height above the river, and what would be exposed if the river rose. Then run the full SDG flow for the same place.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Segmented label="Circle size" options={RADII} value={radius} onChange={setRadius} />
        <span className="text-[13px] text-ink-300">{point ? `Place: ${point.lat.toFixed(4)} N, ${point.lng.toFixed(4)} E${here ? ` (${here.name}, ${here.iso === "IND" ? "India" : "Nepal"})` : ""}` : "No place chosen yet"}</span>
      </div>

      <div className="mt-3"><CoordinateBox point={point} onPick={setPoint} /></div>
      <div className="mt-3"><MapTabs point={point} radiusKm={radius} onPick={setPoint} /></div>
      {!point && <div className="mt-3"><Banner>Click the map inside the dashed box to choose a place.</Banner></div>}

      {point && (
        <>
          <ForecastCard point={point} onResult={setFc} onRunFlow={onStartFlow} />
          <PhysicsPilotCard />
          <LandslideCard point={point} radiusKm={radius} />
          <PointOutlook point={point} seed={null} rise={2} />
          {onStartFlow && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => onStartFlow({ lat: point.lat, lng: point.lng, forecast: fc })} className="inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-5 py-2.5 text-[14px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal">
                Run the full SDG flow for this place <ArrowRight size={15} aria-hidden />
              </button>
              <span className="max-w-xl text-[13px] text-ink-300">{fc?.date ? `Starts with ${fc.title ?? fc.date}. ` : "No river forecast day is selected, so it starts with a river rise you choose. "}Flood maps, communities, households, crops, recovery need and the PDF report, one step at a time.</span>
            </div>
          )}

          <h3 className="mt-10 text-[16px] font-semibold text-white">What would be exposed if the river rose (terrain what-if)</h3>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-300">The same terrain rule at several river rises. No flow physics and no river forecast. Counts are exposure, not casualties or damage. Money is an estimated recovery need, not a release decision.</p>
          {failed && <div className="mt-3"><Banner tone="amber">{failed.error.message}</Banner></div>}
          <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700/70">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <caption className="sr-only">Exposure inside the circle for each what-if river rise, corrected elevation model</caption>
              <thead className="bg-ink-850/70 text-ink-200">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">If the river rises</th>
                  <th scope="col" className="px-3 py-2 font-medium">Flooded area</th>
                  <th scope="col" className="px-3 py-2 font-medium w-[22%]">People exposed (corrected)</th>
                  <th scope="col" className="px-3 py-2 font-medium">People exposed (raw)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Cropland</th>
                  <th scope="col" className="px-3 py-2 font-medium">Estimated recovery need (INR)</th>
                </tr>
              </thead>
              <tbody>
                {RISES.map((r, i) => {
                  const d = ds[i]; const c = d?.scenario?.corrected; const n = need(d);
                  return (
                    <tr key={r} className="border-t border-ink-700/50 text-ink-100">
                      <th scope="row" className="px-3 py-2 font-medium">{r} m</th>
                      {!d ? <td colSpan={5} className="px-3 py-2 text-ink-400">{qs[i].isError ? NO_DATA : loading ? "Loading..." : NO_DATA}</td> : (
                        <>
                          <td className="px-3 py-2 tabular-nums">{c?.flooded_km2 == null ? NO_DATA : `${c.flooded_km2.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km²`}</td>
                          <td className="px-3 py-2"><div className="tabular-nums">{fmtInt(c?.people)}</div><Bar value={c?.people} max={maxPeople} /></td>
                          <td className="px-3 py-2 tabular-nums">{fmtInt(d.scenario?.raw?.people)}</td>
                          <td className="px-3 py-2 tabular-nums">{c?.cropland_ha == null ? NO_DATA : `${fmtInt(c.cropland_ha)} ha`}</td>
                          <td className="px-3 py-2 tabular-nums">{n ? fmtRange(n[0], n[1], (v) => fmtMoney(v, "INR")) : NO_DATA}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-300">
        <p><strong className="text-ink-100">What each part answers:</strong> the outlook says how likely flooding is in a typical coming year. The rainfall what-if shows dry, typical and wet seasons. The river forecast gives a day, date and year when river flow is expected to reach a flood level. The terrain what-if shows what a river rise would put under water. A 2D physics flood model was tested against satellite floods and did not beat simple baselines, so it is not shown. A hill landslide screen, where shown, is not validated.</p>
        <p className="mt-2">The corrected elevation model is not claimed to improve flood prediction. Rows that show No data had no result from the server for that rise.</p>
      </div>
    </div>
  );
}
