// SDG API client - talks to server/sdg_routes.py (read-only)

import { API_BASE } from "./apiBase";
const BASE_URL = `${API_BASE}/sdg`;

async function getJson(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch (e) { /* no body */ }
    throw new Error(detail || `SDG API error (${res.status}): ${path}`);
  }
  return res.json();
}

export const fetchSdgMeta = () => getJson("/meta");
export const fetchSdgSummary = (p) => getJson("/summary", p);
export const fetchSdgYearly = (p) => getJson("/yearly", p);
export const fetchSdgDistricts = (p) => getJson("/districts", p);

// ---- number formatting (a missing value is always shown as "No data", never as 0) ----
export const NO_DATA = "No data";

export function fmtInt(v) {
  return v == null ? NO_DATA : Math.round(v).toLocaleString("en-IN");
}

export function fmtCompact(v) {
  if (v == null) return NO_DATA;
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} crore`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} lakh`;
  return Math.round(v).toLocaleString("en-IN");
}

// money: INR in crore (1 crore = 10^7); NPR in million
export function fmtMoney(v, currency) {
  if (v == null) return NO_DATA;
  if (currency === "NPR") return `NPR ${(v / 1e6).toLocaleString("en-IN", { maximumFractionDigits: 1 })} million`;
  return `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 1 })} crore`;
}

export function fmtRange(a, b, f) {
  if (a == null && b == null) return NO_DATA;
  if (a == null || b == null) return f(a ?? b);
  if (a === b) return f(a);
  return `${f(a)} to ${f(b)}`;
}

export const fmtPct = (v) => (v == null ? NO_DATA : `${v.toFixed(1)}%`);

// ---- place chain + map (server/sdg_chain_routes.py)
export const fetchScenario = (p) => getJson("/chain/scenario", p);
export const fetchSdgMap = (p) => getJson("/map", p);
export const fetchSdgGeojson = () => getJson("/geojson");
export const mapkitTokenUrl = (origin) => `${BASE_URL}/mapkit-token?origin=${encodeURIComponent(origin)}`;
export const fetchPointCheck = (p) => getJson("/chain/point", p);
export const fetchRegionMaps = (p) => getJson("/chain/region", p);
export const fetchCropContext = () => getJson("/context/crops");
export const fetchAdmin1 = (p) => getJson("/context/admin1", p);
export const fetchScene = (p) => getJson("/chain/scene", p);
