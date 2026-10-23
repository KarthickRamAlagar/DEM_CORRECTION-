import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

// Patch 16. Type a place instead of clicking the map. It calls the same onPick({ lat, lng }) the map click calls, so nothing else changes.
// Accepts "27.20" and "82.55" in the two boxes, or "27.20, 82.55" (also "27.20N 82.55E") pasted into either box.
const BOX = { west: 81.9, east: 84.0, south: 25.4, north: 28.0 };   // river-height layer, same box as the dashed rectangle on the map

export function parseCoords(latText, lngText) {
  const nums = (s) => (String(s ?? "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let a = nums(latText), b = nums(lngText), lat, lng;
  if (a.length >= 2) { lat = a[0]; lng = a[1]; }
  else if (b.length >= 2) { lat = b[0]; lng = b[1]; }
  else if (a.length === 1 && b.length === 1) { lat = a[0]; lng = b[0]; }
  else return { error: "Type a latitude and a longitude, for example 27.20 and 82.55." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Type numbers only, for example 27.20 and 82.55." };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "Latitude must be between -90 and 90, and longitude between -180 and 180." };
  if (lat > 40 && lng >= 5 && lng <= 40) return { error: "Latitude comes first (about 27 here) and longitude second (about 82 here). Please swap them." };
  const outside = lat < BOX.south || lat > BOX.north || lng < BOX.west || lng > BOX.east;
  return { lat, lng, outside };
}

export default function CoordinateBox({ point, onPick }) {
  const [lat, setLat] = useState(point ? point.lat.toFixed(4) : "");
  const [lng, setLng] = useState(point ? point.lng.toFixed(4) : "");
  const [msg, setMsg] = useState(null);
  const typed = useRef(null);   // the place this box just sent, so its own note is not wiped when the map follows
  useEffect(() => {
    if (!point) return;
    setLat(point.lat.toFixed(4)); setLng(point.lng.toFixed(4));
    if (!(typed.current && typed.current.lat === point.lat && typed.current.lng === point.lng)) setMsg(null);
  }, [point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (e) => {
    e?.preventDefault();
    const r = parseCoords(lat, lng);
    if (r.error) { setMsg({ tone: "error", text: r.error }); return; }
    setMsg(r.outside ? { tone: "note", text: "This place is outside the dashed box, so there is no river-height data for it. The SDG flow is not available here." } : null);
    typed.current = { lat: r.lat, lng: r.lng };
    onPick?.({ lat: r.lat, lng: r.lng });
  };
  const field = "w-28 rounded-md border border-ink-700 bg-ink-850/80 px-2.5 py-1.5 text-[13px] tabular-nums text-ink-100 placeholder:text-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal";
  return (
    <form onSubmit={go} className="flex flex-wrap items-end gap-3" aria-label="Go to coordinates">
      <label className="flex flex-col gap-1 text-[12px] text-ink-300">Latitude (N)
        <input className={field} inputMode="decimal" autoComplete="off" placeholder="27.20" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude in degrees north" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-300">Longitude (E)
        <input className={field} inputMode="decimal" autoComplete="off" placeholder="82.55" value={lng} onChange={(e) => setLng(e.target.value)} aria-label="Longitude in degrees east" />
      </label>
      <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal/15 px-4 py-1.5 text-[13px] font-semibold text-signal-teal hover:bg-signal-teal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal">
        <MapPin size={14} aria-hidden /> Go to place
      </button>
      {msg && <p role={msg.tone === "error" ? "alert" : "status"} className={`basis-full text-[12.5px] ${msg.tone === "error" ? "text-signal-amber" : "text-ink-300"}`}>{msg.text}</p>}
    </form>
  );
}
