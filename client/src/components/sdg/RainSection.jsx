import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRainOutlook, fetchRainMethod } from "../../lib/rainOutlookApi";
import { fmtInt, fmtRange, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented } from "./Ui";

// Rainfall-driven outlook (patch 12). Numbers come from etl/forecast/build_rain_model.py through /api/sdg/outlook/rain.
// The scenarios are "if the season's rain is like the drier / middle / wetter third of 2019-2025". They are NOT rainfall forecasts.
// If rainfall did not help on years the model had not seen, the page says so and shows no rainfall-based numbers.
const COUNTRIES = [{ id: "IND", label: "India" }, { id: "NPL", label: "Nepal (Terai)" }];
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
        <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700/70">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
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
                    <div className="tabular-nums text-[12.5px]">{fmtRange(r.wet.p10, r.wet.p90, fmtInt)} <span className="text-ink-400">middle {fmtInt(r.wet.p50)}</span></div>
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
      {s && (
        <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-900/55 px-4 py-3">
          <h4 className="text-[13.5px] font-medium text-ink-100">Test: leave one year out ({m.data.years[0]} to {m.data.years[m.data.years.length - 1]}), {s.districts} districts</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-ink-300"><tr><th scope="col" className="py-1 pr-3 font-medium">Model</th><th scope="col" className="py-1 pr-3 font-medium">Better than plain history</th><th scope="col" className="py-1 pr-3 font-medium">Years better (of {m.data.years.length})</th></tr></thead>
            <tbody>{Object.entries(s.models).map(([k, v]) => (
              <tr key={k} className="border-t border-ink-700/40 text-ink-100"><th scope="row" className="py-1 pr-3 font-medium">{NAME[k] ?? k}{s.chosen === k ? " (used)" : ""}</th><td className="py-1 pr-3 tabular-nums">{k === "history" ? "Reference" : pc(v.skill_vs_history)}</td><td className="py-1 pr-3 tabular-nums">{v.years_better_than_history ?? "Reference"}</td></tr>
            ))}</tbody></table></div>
          <p className="mt-2 max-w-[80ch] text-[13px] leading-relaxed text-ink-200">{(NAME[s.chosen] && s.chosen !== "history" ? s.reason.replace(s.chosen, `"${NAME[s.chosen]}"`) : s.reason).replace(/^./, (c) => c.toUpperCase())}.{s.spearman_season_rain_vs_exposure_change != null ? ` In wetter seasons the exposure was ${s.spearman_season_rain_vs_exposure_change > 0.1 ? "higher than" : s.spearman_season_rain_vs_exposure_change < -0.1 ? "lower than" : "about the same as"} the district's usual (rank correlation ${s.spearman_season_rain_vs_exposure_change.toFixed(2)}).` : ""}</p>
        </div>
      )}
      {m.data && <ul className="mt-3 max-w-[80ch] list-disc pl-5 text-[13px] leading-relaxed text-ink-300">{m.data.limits.map((x) => <li key={x}>{x}</li>)}</ul>}
    </section>
  );
}
