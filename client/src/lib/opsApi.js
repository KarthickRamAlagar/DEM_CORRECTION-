// Hidden monitoring dashboard: talks to the gateway's secret routes.
// The key is typed by the developer and kept in this browser tab only (sessionStorage). It is never in the code bundle.
const KEY = "ops_monitor_key";
export const gatewayBase = () => String(import.meta.env.VITE_GATEWAY_BASE || "http://localhost:3100").replace(/\/$/, "");

export function getKey() {
  try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; }
}
export function setKey(v) {
  try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* storage blocked: the key just is not remembered */ }
}

// name: health | pipeline | layers | quality | lineage
export async function opsGet(name, key) {
  let r;
  try {
    r = await fetch(`${gatewayBase()}/__monitor/${encodeURIComponent(key)}/${name}`, { cache: "no-store" });
  } catch {
    const e = new Error("The gateway did not answer."); e.kind = "network"; throw e;
  }
  if (!r.ok) { const e = new Error("Not available."); e.kind = "denied"; e.status = r.status; throw e; }
  return r.json();
}
