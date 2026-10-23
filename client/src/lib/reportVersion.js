import { API_BASE } from "./apiBase";
// The last line of the PDF: which code commit and which model produced the report. Values come from the lineage manifest through /api/sdg/version.
// A value that is not recorded is printed as "No data". Never guessed.
export async function reportVersionLine() {
  let v = null;
  try {
    const r = await fetch(`${API_BASE}/sdg/version`);
    if (r.ok) v = await r.json();
  } catch { /* server not reachable: print No data */ }
  const c = v?.git_commit ? String(v.git_commit).slice(0, 8) : null;
  const dirty = Number.isFinite(v?.uncommitted_files) && v.uncommitted_files > 0 ? ` (+${v.uncommitted_files} uncommitted files when recorded)` : "";
  const mv = v?.model_version ? String(v.model_version) : null;
  return `Code commit: ${c ? c + dirty : "No data"}. Model version: ${mv ?? "No data"}.${v?.manifest_created_utc ? ` Recorded ${String(v.manifest_created_utc).slice(0, 10)}.` : ""}`;
}
