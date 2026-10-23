import { API_BASE } from "./apiBase";
// Patch 22: roads, bridges, schools and health facilities in the flooded part of the circle.
export async function fetchAssets({ lat, lon, radius_km, rise_m }) {
  const qs = new URLSearchParams({ lat, lon, radius_km, rise_m }).toString();
  const r = await fetch(`${API_BASE}/sdg/chain/assets?${qs}`);
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error(body?.detail || body?.error || "Roads and facilities could not be loaded.");
  return body;
}
