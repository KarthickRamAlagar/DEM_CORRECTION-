import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, KeyRound, RefreshCw } from "lucide-react";
import { Note } from "./evaluation/ui";
import { getKey, opsGet, setKey } from "../lib/opsApi";
import { Pill } from "../components/ops/OpsUi";
import { AnalystView, FintechView, MetricsView, OverviewView, ProvenanceView, SpaceView, SystemView } from "../components/ops/OpsViews";

const TABS = [
  { id: "overview", label: "Overview", who: "Everyone" },
  { id: "space", label: "Space and satellite", who: "Technical, earth observation" },
  { id: "analyst", label: "Analyst", who: "SDG and exposure" },
  { id: "fintech", label: "Fintech and policy", who: "Recovery need, assumptions, audit" },
  { id: "system", label: "System", who: "Live health" },
  { id: "data", label: "Data and lineage", who: "Quality and traceability" },
  { id: "metrics", label: "All metrics", who: "The ten layers" },
];

function KeyGate({ onSubmit, error }) {
  const [v, setV] = useState("");
  return (
    <div className="h-full w-full overflow-y-auto"><div className="max-w-[520px] mx-auto px-5 py-16">
      <h1 className="text-[26px] font-semibold text-white flex items-center gap-3"><KeyRound size={22} className="text-signal-teal" /> Monitoring</h1>
      <p className="mt-3 text-[14.5px] text-ink-300 leading-relaxed">This page is for the developer. Type the monitoring key from <span className="font-mono">gateway/.env</span> (MONITOR_SECRET). The key stays in this browser tab and is cleared when you close it.</p>
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}>
        <label className="sr-only" htmlFor="ops-key">Monitoring key</label>
        <input id="ops-key" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} className="flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3.5 py-2.5 text-[14px] text-white focus:outline-none focus:ring-2 focus:ring-signal-teal/60" placeholder="Monitoring key" />
        <button type="submit" className="rounded-lg bg-signal-teal px-4 py-2.5 text-[14px] font-medium text-ink-950 hover:brightness-110">Open</button>
      </form>
      {error && <div className="mt-4"><Note tone="red">{error}</Note></div>}
    </div></div>
  );
}

export default function OpsDashboardPage() {
  const [key, setK] = useState(() => getKey());
  const [tab, setTab] = useState("overview");
  const [open, setOpen] = useState(1);
  const [layers, setLayers] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [health, setHealth] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(key); keyRef.current = key;

  const deny = (e) => { setErr(e.kind === "network" ? "The gateway did not answer. Check that it is running on this computer (npm run dev in gateway/) and that VITE_GATEWAY_BASE points to it." : "Not available. Check the key, that monitoring is switched on in gateway/.env, and that you are on the same computer as the gateway."); if (e.kind !== "network") { setKey(""); setK(""); } };

  const loadStatic = useCallback(async () => {
    setBusy(true);
    try {
      const [l, p] = await Promise.all([opsGet("layers", keyRef.current), opsGet("pipeline", keyRef.current)]);
      setLayers(l); setPipeline(p); setErr("");
    } catch (e) { deny(e); }
    setBusy(false);
  }, []);
  const loadHealth = useCallback(async () => {
    if (!keyRef.current || document.hidden) return;
    try {
      const h = await opsGet("health", keyRef.current);
      setHealth(h);
      setHistory((a) => [...a.slice(-59), { cpu: h.host?.cpu_percent ?? null, p95: h.api?.p95_ms ?? null }]);
      setErr("");
    } catch (e) { deny(e); }
  }, []);

  useEffect(() => { if (!key) return undefined; loadStatic(); loadHealth(); const t = setInterval(loadHealth, 5000); return () => clearInterval(t); }, [key, loadStatic, loadHealth]);

  if (!key) return <KeyGate error={err} onSubmit={(k) => { setKey(k); setK(k); setErr(""); }} />;

  const noFile = layers && layers.status === "No data";
  const goTo = (t, layerId) => { if (layerId) setOpen(layerId); setTab(t); };
  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto">
      <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-8 py-7 sm:py-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-semibold text-white flex items-center gap-3"><Activity size={24} className="text-signal-teal shrink-0" /> Performance and provenance</h1>
            <p className="mt-2 text-[14.5px] text-ink-300 max-w-[70ch]">How well the DEM engine and the SDG layers perform, what data they stand on, and how the system is running. Built only from files and live readings that exist. Anything missing says “No data”.</p>
            {layers?.created_utc && <p className="mt-1.5 text-[12.5px] text-ink-400">Metric layers built {new Date(layers.created_utc).toLocaleString()}</p>}
          </div>
          <div className="flex items-center gap-3">
            {health ? <Pill tone="green">Gateway live</Pill> : <Pill>Connecting</Pill>}
            <button type="button" onClick={() => { loadStatic(); loadHealth(); }} disabled={busy} className="flex items-center gap-2 rounded-lg border border-ink-700/70 px-3.5 py-2 text-[13.5px] text-ink-200 hover:text-white disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={() => { setKey(""); setK(""); }} className="rounded-lg border border-ink-700/70 px-3.5 py-2 text-[13.5px] text-ink-300 hover:text-white">Lock</button>
          </div>
        </header>

        <div className="mb-6" role="tablist" aria-label="Audience">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} title={t.who}
                className={`shrink-0 rounded-lg border px-4 py-2 text-[14px] transition-colors ${tab === t.id ? "border-signal-teal/60 bg-signal-teal/10 text-ink-100 font-medium" : "border-ink-700/70 text-ink-400 hover:text-ink-100"}`}>{t.label}</button>))}
          </div>
          <p className="mt-2 text-[13px] text-ink-400">{TABS.find((t) => t.id === tab)?.who}</p>
        </div>

        {err && <div className="mb-4"><Note tone="red">{err}</Note></div>}
        {noFile && <div className="mb-4"><Note tone="amber">The metric-layers file has not been built yet. Run <span className="font-mono">uv run python etl/metrics/build_metric_layers.py</span> from the repo root, then press Refresh. Live System readings still work.</Note></div>}

        {tab === "overview" && <OverviewView L={noFile ? null : layers} health={health} goTo={goTo} />}
        {tab === "space" && <SpaceView L={noFile ? null : layers} />}
        {tab === "analyst" && <AnalystView L={noFile ? null : layers} />}
        {tab === "fintech" && <FintechView L={noFile ? null : layers} />}
        {tab === "system" && <SystemView health={health} pipeline={pipeline} history={history} />}
        {tab === "data" && <ProvenanceView L={noFile ? null : layers} />}
        {tab === "metrics" && <MetricsView L={noFile ? null : layers} open={open} key={open} />}
      </div>
    </div>
  );
}
