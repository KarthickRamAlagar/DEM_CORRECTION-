import { useId, useState } from "react";
import { Info } from "lucide-react";

// The river-height (HAND) layer covers this box. Outside it the SDG pages have nothing to show.
export const SDG_BOX = { west: 81.9, east: 84.0, south: 25.4, north: 28.0 };
export const insideSdgBox = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lng >= SDG_BOX.west && lng <= SDG_BOX.east && lat >= SDG_BOX.south && lat <= SDG_BOX.north;

const NOTE_MISSING = "SDG impact needs a place. This result has no map location, so pick the place on the map and run the DEM engine again.";
const NOTE = "SDG impact is not available for this place. It lies outside the river-height area (81.9 to 84.0 E, 25.4 to 28.0 N). Your elevation result above is still complete.";

// Same button for the normal and the technical result page. Outside the river-height box it stays in place but is disabled, with a tooltip.
export default function SdgContinueButton({ lat, lng, corrected, raw, interval = null, date = null, inputs = null, engine = null, className = "", children = "Continue to the SDG impact flow with this result" }) {
  const missing = !Number.isFinite(lat) || !Number.isFinite(lng);
  const ok = insideSdgBox(lat, lng);
  const [tip, setTip] = useState(false);
  const id = useId();
  const go = () => {
    try { sessionStorage.setItem("sdg_chain_point", JSON.stringify({ lat, lng, corrected, raw, interval, date, inputs, engine, from: "dem-engine" })); } catch (e) { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent("app-navigate", { detail: "sdg" }));
  };
  const cls = className || "w-full rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-3 py-2 text-[12px] font-medium text-signal-teal hover:bg-signal-teal/20";
  if (ok) return <button type="button" onClick={go} className={cls}>{children}</button>;
  return (
    <span className="relative block" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)} onClick={() => setTip((t) => !t)} tabIndex={0} aria-describedby={id}>
      <button type="button" disabled aria-disabled="true" tabIndex={-1} className={`${cls} pointer-events-none cursor-not-allowed opacity-50`}>{children}</button>
      {tip && (
        <span id={id} role="tooltip" className="absolute bottom-full left-0 right-0 z-30 mb-2 flex items-start gap-2 rounded-lg border border-signal-amber/50 bg-ink-900 p-3 text-[12px] leading-snug text-ink-100 shadow-xl">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-signal-amber" />
          <span>{missing ? NOTE_MISSING : NOTE}</span>
        </span>
      )}
    </span>
  );
}
