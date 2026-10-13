// EDA API Client - talks to the FastAPI backend built in server/eda_routes.py
// All 9 precomputed endpoints, one small function each.

const BASE_URL = "http://localhost:8000/api/eda";

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`EDA API error (${res.status}): ${path}`);
  return res.json();
}

export function fetchGroups() {
  return getJson("/groups");
}

export function fetchFeaturesForGroup(groupKey) {
  return getJson(`/features/${groupKey}`);
}

export function fetchGroupCorrelation(groupKey) {
  return getJson(`/correlation/${groupKey}`);
}

export function fetchTargetCorrelation() {
  return getJson("/correlation-with-target");
}

export function fetchScatterSample(featureName) {
  return getJson(`/scatter/${featureName}`);
}

export function fetchSpatialGrid() {
  return getJson("/spatial/grid");
}

export function fetchSpatialHexbin() {
  return getJson("/spatial/hexbin");
}

export function fetchMoransScatter() {
  return getJson("/spatial/morans-scatter");
}

export function fetchVariogram() {
  return getJson("/variogram");
}