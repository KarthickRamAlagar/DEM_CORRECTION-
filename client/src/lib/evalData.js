// Loads the stored model evaluation (same two endpoints as the Evaluation page) for the report. Never throws: {e:null} when unavailable.
import { buildEval } from "../pages/evaluation/derive";

const BASE = "http://localhost:8000/api";
const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.statusText); return r.json(); };

export async function loadEvalData() {
  const [bench, spatial] = await Promise.all([getJson(`${BASE}/benchmark/summary`).catch(() => null), getJson(`${BASE}/model/metrics`).catch(() => null)]);
  let e = null;
  if (bench) { try { e = buildEval(bench); } catch { e = null; } }
  return { e, spatial };
}
