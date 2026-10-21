// The result handed over from New Inputs (DEM engine) to the SDG flow. Stored in sessionStorage by the "Continue" button there.
const KEY = "sdg_chain_point";
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readPayload() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (num(p.lat) == null || num(p.lng) == null) return null;
    const iv = Array.isArray(p.interval) && num(p.interval[0]) != null && num(p.interval[1]) != null ? [p.interval[0], p.interval[1]] : null;
    return {
      lat: p.lat, lng: p.lng, rawZ: num(p.raw), correctedZ: num(p.corrected),
      zLo: iv ? Math.min(iv[0], iv[1]) : null, zHi: iv ? Math.max(iv[0], iv[1]) : null,
      date: typeof p.date === "string" ? p.date : null, from: p.from === "dem-engine" ? "dem-engine" : "map",
      inputs: Array.isArray(p.inputs) ? p.inputs : null, engine: p.engine && typeof p.engine === "object" ? p.engine : null,
    };
  } catch (e) { return null; }
}

// the payload is used once; clear it so reopening the SDG page later does not restart an old flow
export function clearPayload() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
}
