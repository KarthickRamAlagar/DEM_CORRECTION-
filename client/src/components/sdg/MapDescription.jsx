import { useEffect, useMemo, useState } from "react";
import { describeScenario } from "../../lib/mapText";
import { fmtInt, NO_DATA } from "../../lib/sdgApi";
import { Bento, BentoCard } from "./Ui";

// The main results of a place map as glass cards. The full sentence version stays on the page for screen readers and for Read aloud,
// so the map is never the only way to get the result.
const COUNTRY = { IND: "India", NPL: "Nepal" };
const km = (v) => (v == null || !Number.isFinite(v) ? NO_DATA : `${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km²`);
const cnt = (v, unit = "") => (v == null || !Number.isFinite(v) ? NO_DATA : `${fmtInt(v)}${unit}`);

export default function MapDescription({ d }) {
  const text = useMemo(() => describeScenario(d), [d]);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* not available */ } }, []);
  useEffect(() => { try { window.speechSynthesis?.cancel(); } catch { /* not available */ } setSpeaking(false); }, [text]);
  if (!text) return null;
  const toggle = () => {
    try {
      const s = window.speechSynthesis;
      if (speaking) { s.cancel(); setSpeaking(false); return; }
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = "en-IN"; u.rate = 0.95; u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
      s.cancel(); s.speak(u); setSpeaking(true);
    } catch { setSpeaking(false); }
  };
  const c = d.scenario.corrected, r = d.scenario.raw;
  const top = (d.districts ?? []).filter((x) => Number.isFinite(x.people)).slice(0, 3);
  const cover = d.river_height_coverage?.corrected;
  const read = canSpeak && (
    <button type="button" onClick={toggle} aria-pressed={speaking} className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-[13px] text-ink-200 hover:text-white">{speaking ? "Stop reading" : "Read aloud"}</button>
  );
  return (
    <div className="mt-3">
      <p className="sr-only">{text}</p>
      <Bento>
        <BentoCard title="Place" value={d.here?.name ?? "Outside mapped districts"} sub={`${d.here?.iso ? `${COUNTRY[d.here.iso]}. ` : ""}${d.radius_km} km circle, river rise ${d.rise_m} m`} className="md:col-span-3 lg:col-span-3" />
        <BentoCard title="Flooded area" value={km(c?.flooded_km2)} sub={`Raw DEM: ${km(r?.flooded_km2)}`} className="md:col-span-3 lg:col-span-3" />
        <BentoCard title="People and cropland" value={cnt(c?.people)} sub={`${cnt(c?.cropland_ha, " ha")} cropland. Raw DEM: ${cnt(r?.people)} people`} className="md:col-span-3 lg:col-span-3" />
        <BentoCard title="Buildings" value={cnt(c?.buildings)} sub={`Raw DEM: ${cnt(r?.buildings)}`} className="md:col-span-3 lg:col-span-3" />
        <BentoCard title="Most people exposed in" action={read} className="md:col-span-6 lg:col-span-8">
          {top.length ? (
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
              {top.map((x) => (
                <li key={`${x.name}${x.iso}`}><div className="font-medium text-white">{x.name}</div><div className="text-[13px] text-ink-300">{COUNTRY[x.iso] ?? ""}{COUNTRY[x.iso] ? ", " : ""}{fmtInt(x.people)} people</div></li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[13px] text-ink-300">{NO_DATA}</p>}
          {Number.isFinite(cover) && <p className="mt-3 text-[13px] text-ink-300">River-height data covers {Math.round(cover * 100)}% of the circle. Cells without it are not counted as flooded.</p>}
        </BentoCard>
        <BentoCard title="Colours on the map" className="md:col-span-6 lg:col-span-4">
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-200">
            {[["#2563eb", "Flooded in both models"], ["#8b5cf6", "Only with the corrected DEM"], ["#f59e0b", "Only with the raw DEM"]].map(([col, t]) => (
              <li key={t} className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: col }} />{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-ink-300">Counts are exposure, not casualties or damage.</p>
        </BentoCard>
      </Bento>
    </div>
  );
}
