import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronDown,
  Play,
  Loader2,
  AlertTriangle,
  Download,
  FileOutput,
  UploadCloud,
  Check,
} from "lucide-react";
import { AOI_PRESETS } from "../lib/spatialMock";
import { fetchElevationProfile } from "../lib/elevation";
import { mean, stdDev, pearsonCorrelation, histogram } from "../lib/stats";
import ProfileLineChart from "../components/analytics/ProfileLineChart";
import HistogramChart from "../components/analytics/HistogramChart";

const COLOR_A = "#5eead4";
const COLOR_B = "#d9c48a";

const PIPELINE_STEPS = [
  "Loading spatial partitions…",
  "Sampling elevation transects…",
  "Computing variance statistics…",
  "Rendering distributions…",
];

function diagonal(bounds) {
  const [[south, west], [north, east]] = bounds;
  return [[south, west], [north, east]];
}

function KpiCard({ label, value, sub, icon: Icon, tone = "text-white" }) {
  return (
    <div className="flex-1 min-w-[150px] bg-ink-900/70 border border-ink-700/70 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 text-ink-400 text-[11px] uppercase tracking-wide">
        <Icon size={13} />
        {label}
      </div>
      <div className={`text-xl font-display font-semibold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [profileAId, setProfileAId] = useState(AOI_PRESETS[0].id);
  const [profileBId, setProfileBId] = useState(AOI_PRESETS[1].id);
  const [samples, setSamples] = useState(40);

  const [profileA, setProfileA] = useState(null);
  const [profileB, setProfileB] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [lastRun, setLastRun] = useState(null);

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const timers = useRef([]);

  const presetA = AOI_PRESETS.find((p) => p.id === profileAId);
  const presetB = AOI_PRESETS.find((p) => p.id === profileBId);

  const runAnalysis = async () => {
    setStatus("loading");
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPipelineRunning(true);
    setPipelineStep(0);
    PIPELINE_STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.current.push(setTimeout(() => setPipelineStep(i), i * 550));
    });
    timers.current.push(
      setTimeout(() => {
        setPipelineRunning(false);
      }, PIPELINE_STEPS.length * 550 + 300)
    );

    try {
      const [a, b] = await Promise.all([
        fetchElevationProfile(diagonal(presetA.bounds)[0], diagonal(presetA.bounds)[1], samples),
        fetchElevationProfile(diagonal(presetB.bounds)[0], diagonal(presetB.bounds)[1], samples),
      ]);
      setProfileA(a);
      setProfileB(b);
      setStatus("ok");
      setLastRun(new Date());
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    runAnalysis();
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (!profileA || !profileB) return null;
    const elevA = profileA.map((p) => p.elevation);
    const elevB = profileB.map((p) => p.elevation);
    return {
      meanA: mean(elevA),
      meanB: mean(elevB),
      stdA: stdDev(elevA),
      stdB: stdDev(elevB),
      r: pearsonCorrelation(elevA, elevB),
      histA: histogram(elevA, 18),
      histB: histogram(elevB, 18),
      totalSamples: elevA.length + elevB.length,
    };
  }, [profileA, profileB]);

  const summary =
    stats && presetA && presetB
      ? `${presetA.name} averages ${stats.meanA.toFixed(1)} m elevation, ${Math.abs(
          stats.meanA - stats.meanB
        ).toFixed(1)} m ${stats.meanA >= stats.meanB ? "higher" : "lower"} than ${presetB.name} (${stats.meanB.toFixed(
          1
        )} m). Profile-shape correlation: r = ${stats.r.toFixed(2)}.`
      : "Run an analysis to generate a summary from live elevation data.";

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 px-5 h-auto min-h-[56px] py-2 border-b border-ink-700/60 shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.15em] text-ink-400 uppercase shrink-0">
          <BarChart3 size={14} className="text-signal-teal" />
          GEOINT / Analytics Studio
        </div>

        <div className="relative">
          <select
            value={profileAId}
            onChange={(e) => setProfileAId(e.target.value)}
            className="appearance-none bg-ink-900 border border-ink-700 rounded-lg pl-3 pr-7 py-1.5 text-[11px] text-ink-200"
          >
            {AOI_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                Profile A: {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={profileBId}
            onChange={(e) => setProfileBId(e.target.value)}
            className="appearance-none bg-ink-900 border border-ink-700 rounded-lg pl-3 pr-7 py-1.5 text-[11px] text-ink-200"
          >
            {AOI_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                Profile B: {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button className="text-ink-400 hover:text-white p-1.5" title="Notifications">
            <Bell size={16} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="flex flex-wrap gap-3 px-5 pt-4">
        <KpiCard
          icon={BarChart3}
          label="Elevation range"
          value={stats ? `${Math.min(...profileA.map((p) => p.elevation), ...profileB.map((p) => p.elevation)).toFixed(0)}–${Math.max(...profileA.map((p) => p.elevation), ...profileB.map((p) => p.elevation)).toFixed(0)} m` : "—"}
          sub="Live, Open-Meteo / Copernicus DEM"
        />
        <KpiCard
          icon={BarChart3}
          label="Profile correlation"
          value={stats ? stats.r.toFixed(2) : "—"}
          sub="Pearson r, real computed"
          tone="text-signal-teal"
        />
        <KpiCard
          icon={BarChart3}
          label="Samples fetched"
          value={stats ? stats.totalSamples : "—"}
          sub={`${samples + 1} pts × 2 profiles`}
        />
        <KpiCard
          icon={BarChart3}
          label="Last run"
          value={lastRun ? lastRun.toLocaleTimeString() : "—"}
          sub={status === "error" ? "Fetch failed" : "UTC local time"}
          tone={status === "error" ? "text-signal-red" : "text-white"}
        />
        <button
          onClick={runAnalysis}
          disabled={status === "loading"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-signal-teal/15 border border-signal-teal/40 text-signal-teal text-[13px] font-medium hover:bg-signal-teal/25 transition-colors disabled:opacity-50 self-center"
        >
          {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run Analysis
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 px-5 py-4 flex-1">
        {/* left: cross-dataset analytics */}
        <div className="flex-1 min-w-0 bg-ink-900/70 border border-ink-700/70 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Cross-Profile Elevation Analytics</h3>
          <p className="text-[11px] text-ink-500 mb-3">
            Real elevation, sampled live along each AOI's diagonal transect via Open-Meteo (Copernicus DEM) —
            not mock numbers.
          </p>

          {status === "error" && (
            <div className="flex items-center gap-2 text-[12px] text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={13} /> Elevation API request failed. Try Run Analysis again.
            </div>
          )}

          {stats ? (
            <>
              <div className="flex items-center gap-4 text-[11px] mb-2">
                <span className="flex items-center gap-1.5 text-ink-300">
                  <span className="w-2.5 h-0.5" style={{ backgroundColor: COLOR_A }} /> {presetA.name}
                </span>
                <span className="flex items-center gap-1.5 text-ink-300">
                  <span className="w-2.5 h-0.5 border-b border-dashed" style={{ borderColor: COLOR_B }} /> {presetB.name}
                </span>
              </div>
              <ProfileLineChart seriesA={profileA} seriesB={profileB} colorA={COLOR_A} colorB={COLOR_B} />

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-2">Variance matrix</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <div className="text-ink-500">Mean elevation Δ</div>
                    <div className="font-mono text-signal-gold text-base">
                      {(stats.meanA - stats.meanB).toFixed(2)} m
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-500">Profile correlation (r)</div>
                    <div className="font-mono text-signal-teal text-base">{stats.r.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-ink-500">Std dev (A / B)</div>
                    <div className="font-mono text-white text-base">
                      {stats.stdA.toFixed(1)} / {stats.stdB.toFixed(1)} m
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
                    {presetA.name} distribution
                  </div>
                  <HistogramChart bins={stats.histA} color={COLOR_A} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
                    {presetB.name} distribution
                  </div>
                  <HistogramChart bins={stats.histB} color={COLOR_B} />
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-[12px] text-ink-500">
              {status === "loading" ? "Fetching live elevation profiles…" : "No data yet — run an analysis."}
            </div>
          )}
        </div>

        {/* right: model execution (simulated) */}
        <div className="w-full lg:w-[340px] shrink-0 bg-ink-900/70 border border-ink-700/70 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-white">Model Execution</h3>
          </div>
          <p className="text-[11px] text-signal-amber bg-signal-amber/10 border border-signal-amber/30 rounded-lg px-2.5 py-1.5 mb-3">
            Simulated — no trained model or ML backend exists yet. This panel demonstrates the intended
            pipeline UX with a mock run log.
          </p>

          <div className="space-y-2 mb-3">
            <select className="w-full bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-2 text-[12px] text-ink-200">
              <option>Terrain Correction Residual Estimation</option>
              <option>3D Canopy Height Estimation</option>
              <option>Land Cover Change Detection</option>
            </select>
            <select className="w-full bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-2 text-[12px] text-ink-200">
              <option>Random Forest v2.4</option>
              <option>LightGBM v0.9</option>
              <option>CatBoost v1.2</option>
            </select>
          </div>

          <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1.5">Parameters (mock)</div>
          <div className="space-y-1.5 text-[12px] mb-4">
            <div className="flex justify-between">
              <span className="text-ink-400">Grid Res</span>
              <span className="font-mono text-ink-100">10m × 10m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-400">Cloud Mask</span>
              <span className="font-mono text-ink-100">&lt; 10%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-400">Ground Points</span>
              <span className="font-mono text-ink-100">Class 2 (ASPRS)</span>
            </div>
          </div>

          <div className="border-t border-ink-800 pt-3 space-y-1.5">
            {PIPELINE_STEPS.map((step, i) => {
              const done = pipelineStep > i || (!pipelineRunning && pipelineStep >= PIPELINE_STEPS.length - 1 && status === "ok");
              const active = pipelineRunning && pipelineStep === i;
              return (
                <div key={step} className="flex items-center gap-2 text-[11px]">
                  {done ? (
                    <Check size={12} className="text-signal-green shrink-0" />
                  ) : active ? (
                    <Loader2 size={12} className="text-signal-teal animate-spin shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-ink-700 shrink-0" />
                  )}
                  <span className={done || active ? "text-ink-200" : "text-ink-600"}>{step}</span>
                </div>
              );
            })}
            <div className="text-[11px] font-mono pt-1">
              Status:{" "}
              {pipelineRunning ? (
                <span className="text-signal-amber">Running…</span>
              ) : status === "ok" ? (
                <span className="text-signal-green">Complete</span>
              ) : (
                <span className="text-ink-500">Idle</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* summary + export */}
      <div className="px-5 pb-5 space-y-3">
        <div className="bg-ink-900/70 border border-ink-700/70 rounded-xl px-4 py-3 text-[12px] text-ink-200">
          <span className="text-ink-500 mr-1.5">Summary:</span>
          {summary}
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Download, label: "Export Zarr Array" },
            { icon: FileOutput, label: "Export Raster TIF" },
            { icon: UploadCloud, label: "Publish API Endpoint" },
          ].map((b) => (
            <button
              key={b.label}
              disabled
              title="Requires a backend — not available in this mock-data phase"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-900/60 border border-ink-700/60 text-[12px] text-ink-500 cursor-not-allowed"
            >
              <b.icon size={13} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
