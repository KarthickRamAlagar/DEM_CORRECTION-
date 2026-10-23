// Datasets API Client - talks to server/datasets_routes.py

import { API_BASE } from "./apiBase";
const BASE_URL = `${API_BASE}/datasets`;

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Datasets API error (${res.status}): ${path}`);
  return res.json();
}

export function fetchDatasets() {
  return getJson("");
}

export function fetchDataset(datasetId) {
  return getJson(`/${datasetId}`);
}