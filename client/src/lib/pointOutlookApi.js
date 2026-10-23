import { API_BASE } from "./apiBase";
export async function fetchPointOutlook({ lat, lon }) {
  const r = await fetch(`${API_BASE}/sdg/outlook/point?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error(body?.detail || "The outlook for this place could not be loaded.");
  return body;
}
