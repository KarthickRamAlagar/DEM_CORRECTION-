import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, BarChart3, CloudRain, MapPin } from "lucide-react";
import { fetchScenario, fmtInt, fmtRange, fmtMoney, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented, Bento, BentoCard, GLASS } from "./Ui";
import MapTabs from "./MapTabs";
import CoordinateBox from "./CoordinateBox";
import OutlookSection from "./OutlookSection";
import RainSection from "./RainSection";
import ForecastCard from "./ForecastCard";
import LandslideCard from "./LandslideCard";
import PointOutlook from "./PointOutlook";

// Future prediction page: three views instead of one long scroll.
//  Place forecast: pick a place; river forecast, chance of flooding, corrected ground and the river-rise what-if.
//  District outlook: how likely flooding is in a typical coming year.
//  Rain what-if: dry, typical and wet season.
// It is NOT a flood warning and NOT a forecast for a named day. Every number comes from the API. Nothing is computed on this page.
const RISES = [1, 2, 3, 4, 6];
const RADII = [{ id: 5, label: "5 km" }, { id: 10, label: "10 km" }, { id: 15, label: "15 km" }];
const VIEWS = [
  { id: "place", title: "Place forecast", text: "River forecast, chance of flooding and the corrected ground for one place you pick on the map.", Icon: MapPin },
  { id: "outlook", title: "District outlook", text: "How likely flooding is in a typical coming year, district by district.", Icon: BarChart3 },
  { id: "rain", title: "Rain what-if", text: "People exposed if the season is dry, typical or wet.", Icon: CloudRain },
];

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
  const [view, setView] = useState("place");
  const [point, setPoint] = useState(null);
  const [fc, setFc] = useState(null);
  const [radius, setRadius] = useState(10);
  const qs = useQueries({
    queries: RISES.map((r) => ({
      queryKey: ["sdg-future", point?.lat, point?.lng, radius, r],
      queryFn: () => fetchScenario({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: r }),
      enabled: !!point && view === "place", staleTime: 5 * 60 * 1000,
    })),
  });
  const loading = qs.some((q) => q.isLoading);
  const failed = qs.find((q) => q.isError);
  const ds = qs.map((q) => q.data);
  const here = ds.find(Boolean)?.here;
  const maxPeople = Math.max(0, ...ds.map((d) => d?.scenario?.corrected?.people ?? 0));
  const placeName = here ? `${here.name}, ${here.iso === "IND" ? "India" : "Nepal"}` : null;

  return (
    <div className="mt-5">
      <div role="tablist" aria-label="Future prediction views" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {VIEWS.map(({ id, title, text, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`${GLASS} flex items-start gap-3 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal ${view === id ? "ring-1 ring-signal-teal/70 bg-white/[0.07]" : "hover:bg-white/[0.07]"}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${view === id ? "bg-signal-teal text-ink-950" : "bg-white/[0.06] text-signal-teal"}`}><Icon size={17} aria-hidden /></span>
            <span className="min-w-0"><span className={`block text-[13px] font-semibold ${view === id ? "text-white" : "text-ink-100"}`}>{title}</span><span className="mt-0.5 block text-[13px] leading-snug text-ink-300">{text}</span></span>
          </button>
        ))}
      </div>

      {view === "outlook" && <div className="mt-5"><OutlookSection /></div>}
      {view === "rain" && <div className="mt-5"><RainSection /></div>}

      {view === "place" && (
        <div className="mt-4">
          <Bento>
            <div className={`${GLASS} min-w-0 p-4 md:col-span-6 lg:col-span-8`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-white">Pick a place on the map</h3>
                <Segmented label="Circle size" options={RADII} value={radius} onChange={setRadius} />
              </div>
              <div className="mt-3"><CoordinateBox point={point} onPick={setPoint} /></div>
              <div className="mt-3"><MapTabs point={point} radiusKm={radius} onPick={setPoint} /></div>
            </div>
            <BentoCard title="Your place" className="md:col-span-6 lg:col-span-4 lg:self-start">
              {point ? (
                <>
                  <div className="mt-1.5 text-[18px] font-semibold leading-tight text-white">{placeName ?? "Place chosen"}</div>
                  <div className="mt-1 text-[13px] tabular-nums text-ink-300">{point.lat.toFixed(4)} N, {point.lng.toFixed(4)} E. {radius} km circle.</div>
                  {onStartFlow && (
                    <button type="button" onClick={() => onStartFlow({ lat: point.lat, lng: point.lng, forecast: fc })}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-4 py-2.5 text-[13px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal">
                      Run the full SDG flow <ArrowRight size={15} aria-hidden />
                    </button>
                  )}
                  <p className="mt-2 text-[13px] leading-snug text-ink-300">{fc?.date ? `Starts with ${fc.title ?? fc.date}.` : "Starts with a river rise you choose."} Flood maps, people, crops, recovery need and the PDF report.</p>
                </>
              ) : <p className="mt-2 text-[13px] leading-relaxed text-ink-200">No place chosen yet. Click the map inside the dashed box, or type a latitude and longitude.</p>}
            </BentoCard>
          </Bento>

          {point && (
            <>
              <ForecastCard point={point} onResult={setFc} onRunFlow={onStartFlow} />
              <div className="mt-4"><PointOutlook point={point} seed={null} rise={2} /></div>
              <LandslideCard point={point} radiusKm={radius} />

              <section className={`mt-4 ${GLASS} p-5`}>
                <h3 className="text-[13px] font-semibold text-white">What would be exposed if the river rose</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-300">The same terrain rule at several river rises, on the corrected elevation. Exposure, not casualties. Money is an estimated recovery need.</p>
                {failed && <div className="mt-3"><Banner tone="amber">{failed.error.message}</Banner></div>}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <caption className="sr-only">Exposure inside the circle for each what-if river rise, corrected elevation model</caption>
                    <thead className="text-ink-300">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">If the river rises</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Flooded area</th>
                        <th scope="col" className="w-[24%] py-2 pr-3 font-medium">People exposed</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Raw DEM people</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Cropland</th>
                        <th scope="col" className="py-2 font-medium">Recovery need</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RISES.map((r, i) => {
                        const d = ds[i]; const c = d?.scenario?.corrected; const n = need(d);
                        return (
                          <tr key={r} className="border-t border-white/10 text-ink-100">
                            <th scope="row" className="py-2.5 pr-3 font-medium text-white">{r} m</th>
                            {!d ? <td colSpan={5} className="py-2.5 text-ink-400">{qs[i].isError ? NO_DATA : loading ? "Loading..." : NO_DATA}</td> : (
                              <>
                                <td className="py-2.5 pr-3 tabular-nums">{c?.flooded_km2 == null ? NO_DATA : `${c.flooded_km2.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km²`}</td>
                                <td className="py-2.5 pr-3"><div className="tabular-nums">{fmtInt(c?.people)}</div><Bar value={c?.people} max={maxPeople} /></td>
                                <td className="py-2.5 pr-3 tabular-nums">{fmtInt(d.scenario?.raw?.people)}</td>
                                <td className="py-2.5 pr-3 tabular-nums">{c?.cropland_ha == null ? NO_DATA : `${fmtInt(c.cropland_ha)} ha`}</td>
                                <td className="py-2.5 tabular-nums">{n ? fmtRange(n[0], n[1], (v) => fmtMoney(v, "INR")) : NO_DATA}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
