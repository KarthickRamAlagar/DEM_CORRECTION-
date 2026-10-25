import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../../lib/apiBase";

// Patch 15. Steep-ground screening. Draws nothing on flat ground. Slope from the elevation model, an optional past day of rain against global thresholds.
// It is a screening, not a landslide forecast, and says whether it was checked against recorded landslides.
const get = async (path, params) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  const r = await fetch(`${API_BASE}/sdg${path}?${qs}`); if (!r.ok) throw new Error("landslide"); return r.json();
};
const pc = (v) => (v == null ? "No data" : `${Math.round(v * 100)}%`);
const dg = (v) => (v == null ? "No data" : `${v.toFixed(0)}°`);

export default function LandslideCard({ point, radiusKm = 10 }) {
  const [day, setDay] = useState("");
  const q = useQuery({ queryKey: ["sdg-landslide", point?.lat, point?.lng, radiusKm, day], queryFn: () => get("/landslide/point", { lat: point.lat, lon: point.lng, radius_km: radiusKm, day }), enabled: !!point, staleTime: 10 * 60 * 1000, retry: false });
  const st = useQuery({ queryKey: ["sdg-landslide-status"], queryFn: () => get("/landslide/status", {}), staleTime: 30 * 60 * 1000, retry: false });
  const d = q.data; if (!d || !d.found || !d.show) return null;
  const c = d.slope.corrected, r = d.slope.raw, v = st.data?.validation, rain = d.rain, ok = v?.verdict?.slope_screen_supported;
  const hp = v?.hill_places;
  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-5" aria-label="Steep ground screening">
      <h3 className="text-[16px] font-semibold text-white">Steep ground near this place</h3>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-200">
        {pc(c.share_ge_15)} of the {radiusKm} km circle is steeper than 15°, and 5% of it is steeper than {dg(c.p95_deg)}. Steep ground can slide when heavy rain falls on it. This is a screening of slope and rain, not a landslide forecast.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-[13px] tabular-nums">
          <thead className="text-ink-300"><tr><th className="py-1.5 pr-3 font-medium">Ground steeper than</th><th className="pr-3 font-medium">Corrected elevation</th><th className="font-medium">Raw elevation</th></tr></thead>
          <tbody>{d.steep_classes_deg.map((k) => (<tr key={k} className="border-t border-ink-700"><td className="py-1.5 pr-3">{k}°</td><td className="pr-3">{pc(c[`share_ge_${k}`])} of the circle</td><td>{r ? `${pc(r[`share_ge_${k}`])} of the circle` : "No data"}</td></tr>))}</tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-[13px] text-ink-200" htmlFor="ls-day">Compare the rain on a past day (June to October)</label>
        <input id="ls-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[13px] text-ink-100" />
      </div>
      {rain && !rain.available && <p className="mt-2 text-[13px] text-signal-amber">{rain.message}</p>}
      {rain?.available && (
        <div className="mt-3">
          <p className="text-[13px] font-semibold text-white">{rain.text}</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[13px] tabular-nums">
            <thead className="text-ink-300"><tr><th className="py-1.5 pr-3 font-medium">Rain total over</th><th className="pr-3 font-medium">Rain that fell</th>{rain.thresholds.map((t) => <th key={t.id} className="pr-3 font-medium">{t.label}</th>)}</tr></thead>
            <tbody>{rain.thresholds[0].by_duration.map((row, i) => (
              <tr key={row.hours} className="border-t border-ink-700"><td className="py-1.5 pr-3">{row.hours / 24} {row.hours === 24 ? "day" : "days"}</td><td className="pr-3">{row.rain_mm == null ? "No data" : `${row.rain_mm} mm`}</td>
                {rain.thresholds.map((t) => <td key={t.id} className="pr-3">{t.by_duration[i].threshold_mm} mm</td>)}</tr>))}
            </tbody></table></div>
          <p className="mt-1 text-[13px] text-ink-400">{rain.note}</p>
        </div>)}

      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-300">
        {ok
          ? `Checked against ${v.events_used} recorded landslides${v.event_years ? ` (${v.event_years[0]} to ${v.event_years[1]})` : ""}: steep ground separated them from random hill places (area under the curve ${hp?.auc_corrected?.toFixed(2)}, 95% range ${hp?.auc_corrected_ci95?.map((x) => x.toFixed(2)).join(" to ")}). The rain part was not checked.`
          : "Not checked against recorded landslides, or the check did not show a clear result. Treat this as unvalidated."}
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-ink-400">{(d.caveats || []).map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}
