import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRainOutlook, fetchRainMethod } from "../../lib/rainOutlookApi";
import { fmtInt, fmtRange, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented, Bento, BentoCard } from "./Ui";

// Rainfall-driven outlook (patch 12). Numbers come from etl/forecast/build_rain_model.py through /api/sdg/outlook/rain.
// The scenarios are "if the season's rain is like the drier / middle / wetter third of 2019-2025". They are NOT rainfall forecasts.
// If rainfall did not help on years the model had not seen, the page says so and shows no rainfall-based numbers.
const COUNTRIES = [{ id: "IND", label: "India" }, { id: "NPL", label: "Nepal (plains)" }];
const BOUNDS = [{ id: "lower_unflagged", label: "Conservative" }, { id: "upper_union", label: "Upper" }];
const NAME = { history: "Plain history", rain_linear: "Rain, linear", rain_gbm: "Rain, boosted trees" };
const pc = (v) => (v == null ? NO_DATA : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

export default function RainSection() {
  const [country, setCountry] = useState("IND");
  const [bound, setBound] = useState("upper_union");
  const m = useQuery({ queryKey: ["rain-method"], queryFn: fetchRainMethod, retry: false });
  const q = useQuery({ queryKey: ["rain-outlook", country, bound], queryFn: () => fetchRainOutlook({ country, bound, target: "people", limit: 15 }), retry: false, enabled: !m.isError });
  const s = m.data?.summary?.[`people|${bound}`];
  const rows = q.data?.rows ?? [];
  const max = Math.max(0, ...rows.map((r) => r.wet?.p90 ?? 0));

  return (
    <section aria-labelledby="rain-h" className="mt-10">
      <h3 id="rain-h" className="text-[15px] font-medium text-ink-100">Does rainfall help? Dry, typical and wet season</h3>
      <div className="mt-2"><Banner tone="amber">
        <strong>A what-if on rain, not a rainfall forecast.</strong> For each district the model was asked: if this season's rain is like the drier, middle or wetter third of the seasons seen in 2019 to 2025, how many people would be exposed? It is used only if it beat the plain history on years it had not seen. Counts are exposure, not casualties.
      </Banner></div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Segmented label="Country" options={COUNTRIES} value={country} onChange={setCountry} />
        <Segmented label="Satellite bound" options={BOUNDS} value={bound} onChange={setBound} />
      </div>
      {m.isError && <div className="mt-3"><Banner tone="amber">{m.error.message}</Banner></div>}
      {s && s.chosen === "history" && (
        <div className="mt-3"><Banner>
          <strong>Rainfall did not make the prediction better on years the model had not seen</strong> ({s.reason}). So no rainfall-based numbers are shown for this bound. The plain district outlook above stays the answer.
        </Banner></div>
      )}
      {s && s.chosen !== "history" && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <caption className="sr-only">People exposed per district in a dry, typical and wet season</caption>
            <thead className="bg-ink-850/70 text-ink-200"><tr>
              <th scope="col" className="px-3 py-2 font-medium">District</th>
              <th scope="col" className="px-3 py-2 font-medium">Dry season</th>
              <th scope="col" className="px-3 py-2 font-medium">Typical season</th>
              <th scope="col" className="px-3 py-2 font-medium w-[28%]">Wet season (range, middle marked)</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.district} className="border-t border-ink-700/50 text-ink-100">
                  <th scope="row" className="px-3 py-2 font-medium">{r.district}</th>
                  {["dry", "typical"].map((k) => <td key={k} className="px-3 py-2 tabular-nums">{fmtRange(r[k].p10, r[k].p90, fmtInt)}<div className="text-[11.5px] text-ink-400">middle {fmtInt(r[k].p50)}</div></td>)}
                  <td className="px-3 py-2">
                    <div className="tabular-nums text-[13px]">{fmtRange(r.wet.p10, r.wet.p90, fmtInt)} <span className="text-ink-400">middle {fmtInt(r.wet.p50)}</span></div>
                    <div className="relative mt-1 h-2 w-full rounded-full bg-ink-800" role="img" aria-label={`Wet season ${fmtInt(r.wet.p10)} to ${fmtInt(r.wet.p90)}`}>
                      <div className="absolute top-0 h-2 rounded-full bg-signal-teal/45" style={{ left: `${(r.wet.p10 / max) * 100}%`, width: `${Math.max(1.5, ((r.wet.p90 - r.wet.p10) / max) * 100)}%` }} />
                      <div className="absolute -top-0.5 h-3 w-[3px] rounded bg-signal-teal" style={{ left: `calc(${(r.wet.p50 / max) * 100}% - 1px)` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s && s.chosen !== "history" && q.data && rows.length === 0 && <p className="mt-3 text-[13px] text-ink-300">{NO_DATA}: no districts for this country and bound.</p>}
      {s && s.chosen !== "history" && s.models[s.chosen] && (
        <div className="mt-4"><Bento>
          <BentoCard title="Model used" value={NAME[s.chosen] ?? s.chosen} sub={`Tested leaving one year out, ${m.data.years[0]} to ${m.data.years[m.data.years.length - 1]}`} className="md:col-span-2 lg:col-span-4" />
          <BentoCard title="Better than plain history" value={pc(s.models[s.chosen].skill_vs_history)} sub="On years the model had not seen." className="md:col-span-2 lg:col-span-4" />
          <BentoCard title="Years better" value={`${s.models[s.chosen].years_better_than_history} of ${m.data.years.length}`} sub={`${s.districts} districts tested.`} className="md:col-span-2 lg:col-span-4" />
        </Bento></div>
      )}
    </section>
  );
}
