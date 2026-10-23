import { useEffect, useMemo, useState } from "react";
import { describeScenario } from "../../lib/mapText";

// Text description and read-aloud for a place map, so the map is never the only way to get the result.
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
  return (
    <div className="mt-3 rounded-xl border border-ink-700/60 bg-ink-900/55 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-[13.5px] font-medium text-ink-100">Text description of this map</h4>
        {canSpeak
          ? <button type="button" onClick={toggle} aria-pressed={speaking} className="rounded-md border border-ink-700/70 px-3 py-1.5 text-[12.5px] text-ink-200 hover:text-white">{speaking ? "Stop reading" : "Read aloud"}</button>
          : <span className="text-[12px] text-ink-400">Read aloud is not supported in this browser.</span>}
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-200 max-w-[80ch]" aria-live="off">{text}</p>
    </div>
  );
}
