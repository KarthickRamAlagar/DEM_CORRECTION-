import { API_BASE } from "./apiBase";
async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
  const r = await fetch(`${API_BASE}/sdg${path}${qs ? `?${qs}` : ""}`);
  let body = null; try { body = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error(body?.detail || "The river forecast could not be loaded.");
  return body;
}
export const fetchForecastPoint = (p) => get("/forecast/point", p);
export const fetchForecastStatus = () => get("/forecast/status");
export const fetchReplay = (p) => get("/forecast/replay", p);
export const fetchReplayStatus = () => get("/forecast/replay/status");
