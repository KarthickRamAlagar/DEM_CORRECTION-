import { API_BASE } from "../lib/apiBase";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileDown } from "lucide-react";
import { Card, Note } from "./evaluation/ui";
import BenchmarkSection from "./evaluation/BenchmarkSection";
import SpatialSection from "./evaluation/SpatialSection";
import { buildEval } from "./evaluation/derive";
import { generateEvalPdf } from "./evaluation/evalPdf";

const BASE = API_BASE;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch { /* keep statusText */ }
    throw new Error(msg);
  }
  return r.json();
}

const SECTIONS = [
  { id: "s1", label: "Benchmark study", text: "Fourteen model types plus ensembles, feature selection and tuning, each checked two ways." },
  { id: "s2", label: "Spatial validation", text: "How the chosen model performs on areas it has never seen." },
];

export default function EvaluationMetricsPage() {
  const [section, setSection] = useState("s1");
  const [bench, setBench] = useState(null);
  const [benchErr, setBenchErr] = useState("");
  const [spatial, setSpatial] = useState(null);
  const [spatialErr, setSpatialErr] = useState("");
  const [pdfMsg, setPdfMsg] = useState("");

  useEffect(() => {
    getJson(`${BASE}/benchmark/summary`).then(setBench).catch((e) => setBenchErr(String(e.message || e)));
    getJson(`${BASE}/model/metrics`).then(setSpatial).catch((e) => setSpatialErr(String(e.message || e)));
  }, []);

  const e = useMemo(() => {
    if (!bench) return null;
    try { return buildEval(bench); } catch { return null; }
  }, [bench]);

  const downloadPdf = () => {
    if (!e) return;
    try {
      generateEvalPdf({ e, spatial });
      setPdfMsg("PDF downloaded");
    } catch (err) {
      setPdfMsg("Could not create the PDF");
      console.error(err);
    }
    setTimeout(() => setPdfMsg(""), 3000);
  };

  return (
    <div className="eval-page flex flex-col h-full w-full min-w-0 overflow-y-auto">
      <div className="w-full max-w-[1240px] mx-auto px-4 sm:px-8 py-7 sm:py-9">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[30px] leading-tight font-semibold text-white flex items-center gap-3">
              <BarChart3 size={24} className="text-signal-teal shrink-0" /> Model evaluation
            </h1>
            <p className="mt-2 text-[15px] text-ink-300 max-w-[68ch]">
              How well the elevation correction works on ground it has never seen, and how it compares with other approaches.
            </p>
            {e && (
              <p className="mt-2 text-[13px] text-ink-400">
                {e.meta.n_rows_total?.toLocaleString()} rows evaluated · results computed once and stored · last run {e.meta.last_run_utc ? new Date(e.meta.last_run_utc).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {pdfMsg && <span className="text-[13px] text-ink-400">{pdfMsg}</span>}
            <button
              onClick={downloadPdf}
              disabled={!e}
              title={e ? "Download the evaluation report as a PDF" : "Results are not loaded yet"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-signal-teal text-ink-950 text-[14px] font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <FileDown size={16} /> Download PDF
            </button>
          </div>
        </header>

        <div className="mb-6">
          <div className="inline-flex rounded-xl border border-ink-700/70 bg-ink-900/60 p-1" role="tablist" aria-label="Evaluation sections">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
                className={`px-5 py-2 rounded-lg text-[14px] transition-colors ${section === s.id ? "bg-signal-teal/15 text-ink-100 font-medium ring-1 ring-signal-teal/50" : "text-ink-400 hover:text-ink-200"}`}
              >
                <span className="text-ink-500 mr-2">{i + 1}</span>
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[13.5px] text-ink-400">{SECTIONS.find((s) => s.id === section)?.text}</p>
        </div>

        {section === "s1" && (
          <>
            {benchErr && (
              <Card>
                <p className="text-[14px] text-signal-red">Could not load the benchmark results: {benchErr}</p>
                <p className="text-[13px] text-ink-400 mt-1.5">Run <span className="font-mono">uv run python model/benchmark/run_benchmark.py --stages all</span>, make sure the server includes the benchmark route, and restart it.</p>
              </Card>
            )}
            {!bench && !benchErr && <p className="text-sm text-ink-400">Loading...</p>}
            {bench && !e && <Card><p className="text-sm text-signal-red">The benchmark results have an unexpected format.</p></Card>}
            {e && <BenchmarkSection e={e} />}
          </>
        )}

        {section === "s2" && (
          <>
            {spatialErr && (
              <Card>
                <p className="text-[14px] text-signal-red">Could not load metrics: {spatialErr}</p>
                <p className="text-[13px] text-ink-400 mt-1.5">Run <span className="font-mono">uv run python model/evaluation/make_eval_summary.py</span> and restart the server.</p>
              </Card>
            )}
            {!spatial && !spatialErr && <p className="text-sm text-ink-400">Loading...</p>}
            {spatial && <SpatialSection data={spatial} />}
            {spatial && <div className="mt-2"><Note tone="teal">{spatial.algorithm} · model {spatial.model_version} · target: {spatial.target}</Note></div>}
          </>
        )}
      </div>
    </div>
  );
}
