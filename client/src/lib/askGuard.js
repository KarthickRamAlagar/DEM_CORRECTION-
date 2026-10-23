// Safety guard for "Ask your data" (master prompt section 34).
// The language model writes the sentence. This check runs on the page, after the answer arrives:
// every number in the sentence must come from the rows the database returned (or from the question itself).
// If a number cannot be found, or no rows came back, the page shows a fixed message instead of the sentence.
export const NOT_AVAILABLE = "The required data is not available.";
const MULT = { thousand: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, million: 1e6, crore: 1e7, crores: 1e7, billion: 1e9 };

function numbersIn(text) {
  const out = [];
  const re = /(\d[\d,]*(?:\.\d+)?)(?:\s*(%|(?:thousand|lakhs?|crores?|million|billion|k)\b))?/gi;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const raw = m[1].replace(/,+$/, "");
    const v = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    const dec = (raw.split(".")[1] || "").length;
    const unit = (m[2] || "").toLowerCase();
    out.push({ v: unit && unit !== "%" ? v * MULT[unit] : v, dec, pct: unit === "%", mult: unit && unit !== "%" ? MULT[unit] : 1 });
  }
  return out;
}
function flat(rows) {
  const vals = [];
  for (const r of Array.isArray(rows) ? rows : []) for (const x of Object.values(r || {})) {
    if (typeof x === "number" && Number.isFinite(x)) vals.push(x);
    else if (typeof x === "string") for (const n of numbersIn(x)) vals.push(n.v);
  }
  return vals;
}
function found(n, pool) {
  const tol = 0.5 * Math.pow(10, -n.dec) * n.mult + 1e-9;
  return pool.some((p) => Math.abs(p - n.v) <= tol || (n.pct && Math.abs(p * 100 - n.v) <= tol) || (n.mult > 1 && Math.abs(p - n.v) <= tol));
}

// data = the response of /api/ask. Returns { ok, answer, reason }.
export function guardAnswer(data, question = "") {
  if (!data || typeof data.answer !== "string" || !data.answer.trim()) return { ok: false, answer: NOT_AVAILABLE, reason: "No answer text came back." };
  if (String(data.provider || "").startsWith("schema-metadata")) return { ok: true, answer: data.answer, reason: null }; // fixed text from the feature dictionary, no model
  const rows = Array.isArray(data.results) ? data.results : [];
  if (rows.length === 0) return { ok: false, answer: NOT_AVAILABLE, reason: "The query returned no rows." };
  const pool = flat(rows).concat(numbersIn(question).map((n) => n.v));
  const missing = numbersIn(data.answer).filter((n) => !found(n, pool));
  if (missing.length) return { ok: false, answer: NOT_AVAILABLE, reason: `The sentence contained a number that is not in the returned rows (${missing.slice(0, 3).map((n) => n.v).join(", ")}).` };
  return { ok: true, answer: data.answer, reason: null };
}
