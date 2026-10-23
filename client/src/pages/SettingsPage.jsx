import { API_ORIGIN } from "../lib/apiBase";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mic, FileText, Palette, RotateCcw, Info, ShieldCheck, Activity,
  Download, Upload, Trash2, Play, Square, PlayCircle, RefreshCw, CheckCircle2, XCircle,
} from "lucide-react";
import { useSettings } from "../lib/useSettings";
import {
  updateSettings, resetSettings, exportSettingsJson, importSettingsJson,
} from "../lib/settingsStore";
import { speakText, stopSpeaking, listVoices } from "../lib/speakText";
import { playTingSound } from "../lib/notificationSound";

const API_BASE = API_ORIGIN;
const MODEL_INFO_URL = `${API_BASE}/api/model/info`;
const TLE_CACHE_PREFIX = "leo-dashboard:tle:v1:"; // same prefix useTleCatalog.js writes

const NAV_ITEMS = [
  { id: "voice", label: "Voice & Assistant", icon: Mic },
  { id: "pdf", label: "PDF Report", icon: FileText },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data & Privacy", icon: ShieldCheck },
  { id: "system", label: "System Status", icon: Activity },
  { id: "about", label: "About", icon: Info },
];

// Services the app talks to, checked by the System Status tab
const SERVICE_CHECKS = [
  { id: "model", label: "Prediction & model service", path: "/api/model/info" },
  { id: "datasets", label: "Datasets service", path: "/api/datasets" },
  { id: "tle", label: "Satellite orbit proxy (CelesTrak)", path: "/api/tle/status" },
];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-signal-teal" : "bg-ink-600"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}

function SettingRow({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-ink-700/40 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-white">{title}</p>
        {description && <p className="text-[12px] text-ink-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-ink-900/60 border border-ink-700/60 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white tracking-wide uppercase">{title}</h2>
      {description && <p className="text-[12px] text-ink-400 mt-1 mb-2">{description}</p>}
      <div>{children}</div>
    </div>
  );
}

function ActionButton({ icon: Icon, children, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "border-ink-700 text-ink-300 hover:text-white hover:border-signal-red/50"
          : "border-ink-700 text-ink-300 hover:text-white hover:border-signal-teal/50"
      }`}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

const selectClass =
  "bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[13px] text-white max-w-[220px]";

// Voices load asynchronously in Chrome, so listen for the update event
function useVoices() {
  const [voices, setVoices] = useState(() => listVoices());
  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const update = () => setVoices(listVoices());
    update();
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", update);
  }, []);
  return voices;
}

function countKeys(prefix) {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      if (localStorage.key(i)?.startsWith(prefix)) n += 1;
    }
  } catch {
    /* storage blocked */
  }
  return n;
}

export default function SettingsPage() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const voices = useVoices();
  const [activeSection, setActiveSection] = useState("voice");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelInfoError, setModelInfoError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dataMessage, setDataMessage] = useState(null); // { ok, text }
  const [cacheCounts, setCacheCounts] = useState({ tle: 0, queries: 0 });
  const [checks, setChecks] = useState({}); // id -> { state, ms, detail }
  const [checking, setChecking] = useState(false);
  const fileInputRef = useRef(null);
  const checkedOnce = useRef(false);
  const flashTimer = useRef(null);

  // About tab reads the real model facts from the server's registry (nothing hard-coded)
  useEffect(() => {
    fetch(MODEL_INFO_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then(setModelInfo)
      .catch(() => setModelInfoError(true));
  }, []);

  const flash = () => {
    setSavedFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const set = (key, value) => {
    updateSettings({ [key]: value });
    flash();
  };

  const handleReset = () => {
    resetSettings();
    stopSpeaking();
    setShowResetConfirm(false);
    flash();
  };

  // ---- Voice ----
  const testVoice = () => {
    if (testing) {
      stopSpeaking();
      setTesting(false);
      return;
    }
    setTesting(true);
    const started = speakText(
      "This is how spoken feedback will sound in the DEM Correction Engine.",
      "en-IN",
      { force: true, onend: () => setTesting(false) }
    );
    if (!started) setTesting(false);
  };

  // ---- Data & Privacy ----
  const refreshCounts = useCallback(() => {
    setCacheCounts({
      tle: countKeys(TLE_CACHE_PREFIX),
      queries: queryClient.getQueryCache().getAll().length,
    });
  }, [queryClient]);

  useEffect(() => {
    if (activeSection === "data") refreshCounts();
  }, [activeSection, refreshCounts]);

  const clearCaches = () => {
    const tle = countKeys(TLE_CACHE_PREFIX);
    const queries = queryClient.getQueryCache().getAll().length;
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(TLE_CACHE_PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* storage blocked */
    }
    queryClient.clear();
    refreshCounts();
    setDataMessage({ ok: true, text: `Cleared ${tle} cached orbit entries and ${queries} cached data queries. They reload when needed.` });
  };

  const restartTour = () => {
    window.dispatchEvent(new CustomEvent("demCorrectionRestartTour"));
    setDataMessage({ ok: true, text: "Guided tour restarted - it is showing on screen now." });
  };

  const exportSettings = () => {
    try {
      const blob = new Blob([exportSettingsJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dem-correction-settings.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDataMessage({ ok: true, text: "Settings exported to dem-correction-settings.json." });
    } catch {
      setDataMessage({ ok: false, text: "Could not export settings in this browser." });
    }
  };

  const importSettings = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 100 * 1024) {
      setDataMessage({ ok: false, text: "That file is too large to be a settings file." });
      return;
    }
    const res = importSettingsJson(await file.text());
    if (res.ok) {
      flash();
      setDataMessage({
        ok: true,
        text: `Imported ${res.applied} setting${res.applied === 1 ? "" : "s"}${res.ignored ? ` (${res.ignored} unrecognised value${res.ignored === 1 ? "" : "s"} ignored)` : ""}.`,
      });
    } else {
      setDataMessage({ ok: false, text: res.error });
    }
  };

  // ---- System status ----
  const runChecks = useCallback(async () => {
    setChecking(true);
    setChecks(Object.fromEntries(SERVICE_CHECKS.map((s) => [s.id, { state: "pending" }])));
    await Promise.all(
      SERVICE_CHECKS.map(async (svc) => {
        const started = performance.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        let result;
        try {
          const res = await fetch(`${API_BASE}${svc.path}`, { signal: ctrl.signal });
          const ms = Math.round(performance.now() - started);
          result = res.ok
            ? { state: "ok", ms }
            : { state: "fail", ms, detail: `HTTP ${res.status}` };
        } catch (err) {
          result = { state: "fail", detail: err?.name === "AbortError" ? "timed out after 6 s" : "unreachable" };
        } finally {
          clearTimeout(timer);
        }
        setChecks((prev) => ({ ...prev, [svc.id]: result }));
      })
    );
    setChecking(false);
  }, []);

  useEffect(() => {
    if (activeSection === "system" && !checkedOnce.current) {
      checkedOnce.current = true;
      runChecks();
    }
  }, [activeSection, runChecks]);

  const speechSupported = typeof window !== "undefined" && !!window.speechSynthesis;
  let storageOk = true;
  try {
    localStorage.setItem("__settings_probe", "1");
    localStorage.removeItem("__settings_probe");
  } catch {
    storageOk = false;
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[11px] font-mono tracking-[0.15em] uppercase text-ink-400">GEOINT / Settings</p>
          <h1 className="mt-1 font-display text-xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-ink-400">Configure your DEM-Correction workspace</p>
        </div>
        <span
          aria-live="polite"
          className={`text-[12px] text-signal-teal flex items-center gap-1.5 transition-opacity ${savedFlash ? "opacity-100" : "opacity-0"}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-signal-teal" /> Settings saved
        </span>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        <nav className="w-[220px] shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] mb-1 transition-colors ${
                  isActive ? "bg-signal-teal/10 text-signal-teal" : "text-ink-400 hover:bg-ink-800/60 hover:text-white"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 overflow-y-auto space-y-5 pb-6">
          {activeSection === "voice" && (
            <SectionCard title="Voice & Assistant" description="Spoken feedback for prediction results, guided prompts and the guided tour.">
              <SettingRow
                title="Voice Assistance"
                description="Automatic spoken feedback (results, prompts, tips). Buttons you press yourself, like Play answer, still speak when this is off."
              >
                <Toggle checked={settings.voiceEnabled} onChange={(v) => set("voiceEnabled", v)} label="Voice assistance" />
              </SettingRow>
              <SettingRow title="Voice Speed" description="How fast spoken responses are read.">
                <div className="flex items-center gap-2 w-40">
                  <input
                    type="range" min="0.5" max="2" step="0.1"
                    value={settings.voiceSpeed}
                    onChange={(e) => set("voiceSpeed", parseFloat(e.target.value))}
                    className="w-full accent-signal-teal"
                    aria-label="Voice speed"
                  />
                  <span className="text-[12px] text-ink-400 font-mono w-8">{settings.voiceSpeed.toFixed(1)}x</span>
                </div>
              </SettingRow>
              <SettingRow title="Voice Volume" description="Loudness of spoken responses.">
                <div className="flex items-center gap-2 w-40">
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={settings.voiceVolume}
                    onChange={(e) => set("voiceVolume", parseFloat(e.target.value))}
                    className="w-full accent-signal-teal"
                    aria-label="Voice volume"
                  />
                  <span className="text-[12px] text-ink-400 font-mono w-8">{Math.round(settings.voiceVolume * 100)}%</span>
                </div>
              </SettingRow>
              <SettingRow
                title="Voice"
                description={
                  !speechSupported
                    ? "This browser has no speech synthesis, so spoken feedback is unavailable."
                    : voices.length === 0
                      ? "No voices reported yet - the list fills in once the browser loads them."
                      : "Choose which installed voice reads responses."
                }
              >
                <select
                  value={settings.voiceName}
                  onChange={(e) => set("voiceName", e.target.value)}
                  disabled={!speechSupported}
                  className={selectClass}
                  aria-label="Voice"
                >
                  <option value="">Browser default</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                  {settings.voiceName && !voices.some((v) => v.name === settings.voiceName) && (
                    <option value={settings.voiceName}>{settings.voiceName} (not installed here)</option>
                  )}
                </select>
              </SettingRow>
              <SettingRow title="Test voice" description="Plays a sample sentence with the speed, volume and voice above.">
                <ActionButton icon={testing ? Square : Play} onClick={testVoice} disabled={!speechSupported}>
                  {testing ? "Stop" : "Play sample"}
                </ActionButton>
              </SettingRow>
              <SettingRow title="Guided tour narration" description="Play the recorded narration during the application tour. The on-screen captions always show.">
                <Toggle checked={settings.tourAudioEnabled} onChange={(v) => set("tourAudioEnabled", v)} label="Guided tour narration" />
              </SettingRow>
              <SettingRow title="Sound effects" description="The short chime when a session limit resets.">
                <div className="flex items-center gap-3">
                  <ActionButton icon={PlayCircle} onClick={playTingSound} disabled={!settings.soundEffects}>Test</ActionButton>
                  <Toggle checked={settings.soundEffects} onChange={(v) => set("soundEffects", v)} label="Sound effects" />
                </div>
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "pdf" && (
            <SectionCard title="PDF Report" description="Choose what the downloaded prediction report (New Inputs page) contains.">
              <SettingRow title="Include Prediction Summary" description="The numerical comparison box at the top of page 1.">
                <Toggle checked={settings.pdfIncludePredictionSummary} onChange={(v) => set("pdfIncludePredictionSummary", v)} label="Include prediction summary" />
              </SettingRow>
              <SettingRow title="Include Correction Insight" description="The plain-language explanation of the correction applied.">
                <Toggle checked={settings.pdfIncludeCorrectionInsight} onChange={(v) => set("pdfIncludeCorrectionInsight", v)} label="Include correction insight" />
              </SettingRow>
              <SettingRow title="Include All Feature Values" description="The full terrain, vegetation, radar, and location tables.">
                <Toggle checked={settings.pdfIncludeAllFeatures} onChange={(v) => set("pdfIncludeAllFeatures", v)} label="Include all feature values" />
              </SettingRow>
              <SettingRow title="Include Validation Metrics" description="Model name, validated RMSE, and confidence.">
                <Toggle checked={settings.pdfIncludeValidation} onChange={(v) => set("pdfIncludeValidation", v)} label="Include validation metrics" />
              </SettingRow>
              <SettingRow title="Include Location Information" description="Real location and coordinates, if a point was picked.">
                <Toggle checked={settings.pdfIncludeLocation} onChange={(v) => set("pdfIncludeLocation", v)} label="Include location information" />
              </SettingRow>
              <SettingRow
                title="Decimal Places"
                description={`Precision for numerical values in the PDF. Example: 1234.56789 prints as ${(1234.56789).toFixed(settings.pdfDecimalPlaces)}`}
              >
                <select
                  value={settings.pdfDecimalPlaces}
                  onChange={(e) => set("pdfDecimalPlaces", parseInt(e.target.value, 10))}
                  className={selectClass}
                  aria-label="Decimal places"
                >
                  {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "appearance" && (
            <SectionCard title="Appearance & Interface" description="Customize the visual behavior of the workspace. Changes apply instantly.">
              <SettingRow
                title="Theme"
                description="Dark is the main design. Light is a beta theme: every page follows it, but maps, satellite imagery and some charts keep their dark styling. System follows your device."
              >
                <div className="flex gap-1.5">
                  {["dark", "light", "system"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => set("theme", opt)}
                      aria-pressed={settings.theme === opt}
                      className={`px-3 py-1.5 rounded-lg text-[12px] capitalize border ${
                        settings.theme === opt
                          ? "border-signal-teal bg-signal-teal/15 text-signal-teal"
                          : "border-ink-700 text-ink-400 hover:text-white"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title="Compact Interface" description="Reduce spacing and card padding across the application.">
                <Toggle checked={settings.compactInterface} onChange={(v) => set("compactInterface", v)} label="Compact interface" />
              </SettingRow>
              <SettingRow
                title="Animations"
                description="Interface transitions, pulsing effects, the globe's idle spin, map fly-to and page animations. Loading spinners keep turning, and live data (satellite positions, the simulation clock) keeps updating."
              >
                <Toggle checked={settings.animationsEnabled} onChange={(v) => set("animationsEnabled", v)} label="Animations" />
              </SettingRow>
              <SettingRow title="Start with sidebar collapsed" description="Use the narrow icon-only sidebar. Applies immediately and every time the app opens.">
                <Toggle checked={settings.sidebarCollapsedDefault} onChange={(v) => set("sidebarCollapsedDefault", v)} label="Start with sidebar collapsed" />
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "data" && (
            <SectionCard title="Data & Privacy" description="What this browser stores, and tools to manage it. Nothing here touches datasets, models or the server.">
              <SettingRow title="Stored in this browser" description="Preferences, the tour-seen flag, usage counters for the daily limits, and cached data.">
                <div className="text-[12px] text-ink-300 font-mono text-right leading-5">
                  <div>{cacheCounts.tle} orbit cache entries</div>
                  <div>{cacheCounts.queries} cached data queries</div>
                </div>
              </SettingRow>
              <SettingRow title="Clear cached data" description="Removes cached satellite orbits and cached page data. They are fetched again when needed. Your settings are kept.">
                <ActionButton icon={Trash2} onClick={clearCaches} danger>Clear cache</ActionButton>
              </SettingRow>
              <SettingRow title="Guided tour" description="Show the application tour again, from the start.">
                <ActionButton icon={RefreshCw} onClick={restartTour}>Restart tour</ActionButton>
              </SettingRow>
              <SettingRow title="Back up settings" description="Save your preferences to a file, or load them on another browser or computer.">
                <div className="flex gap-2">
                  <ActionButton icon={Download} onClick={exportSettings}>Export</ActionButton>
                  <ActionButton icon={Upload} onClick={() => fileInputRef.current?.click()}>Import</ActionButton>
                  <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={importSettings} className="hidden" />
                </div>
              </SettingRow>
              <SettingRow title="API keys & secrets" description="Never stored in the browser or shown here. LLM and data-provider keys live in the server's .env file only.">
                <span className="text-[12px] text-signal-teal flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Server-side only
                </span>
              </SettingRow>
              {dataMessage && (
                <p
                  role="status"
                  className={`mt-3 text-[12px] flex items-start gap-1.5 ${dataMessage.ok ? "text-signal-teal" : "text-signal-red"}`}
                >
                  {dataMessage.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <XCircle size={14} className="mt-px shrink-0" />}
                  {dataMessage.text}
                </p>
              )}
            </SectionCard>
          )}

          {activeSection === "system" && (
            <SectionCard title="System Status" description="Live check of the services this workspace depends on.">
              <div className="flex items-center justify-between pb-2">
                <p className="text-[12px] text-ink-400 font-mono">Server: {API_BASE}</p>
                <ActionButton icon={RefreshCw} onClick={runChecks} disabled={checking}>
                  {checking ? "Checking..." : "Re-check"}
                </ActionButton>
              </div>
              {SERVICE_CHECKS.map((svc) => {
                const c = checks[svc.id];
                return (
                  <SettingRow key={svc.id} title={svc.label} description={svc.path}>
                    {!c || c.state === "pending" ? (
                      <span className="text-[12px] text-ink-400">checking...</span>
                    ) : c.state === "ok" ? (
                      <span className="text-[12px] text-signal-teal flex items-center gap-1.5">
                        <CheckCircle2 size={14} /> Online <span className="font-mono text-ink-400">{c.ms} ms</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-signal-red flex items-center gap-1.5">
                        <XCircle size={14} /> {c.detail}
                      </span>
                    )}
                  </SettingRow>
                );
              })}
              <SettingRow title="Speech synthesis" description="Needed for spoken feedback.">
                <span className={`text-[12px] ${speechSupported ? "text-signal-teal" : "text-signal-amber"}`}>
                  {speechSupported ? `Supported (${voices.length} voices)` : "Not supported in this browser"}
                </span>
              </SettingRow>
              <SettingRow title="Browser storage" description="Needed to remember your settings.">
                <span className={`text-[12px] ${storageOk ? "text-signal-teal" : "text-signal-amber"}`}>
                  {storageOk ? "Available" : "Blocked - settings last for this session only"}
                </span>
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "about" && (
            <SectionCard title="About & System Information">
              <div className="space-y-3 text-[13px]">
                <div className="flex justify-between"><span className="text-ink-400">Application</span><span className="text-white">DEM-Correction Engine</span></div>
                <div className="flex justify-between"><span className="text-ink-400">App Version</span><span className="text-white font-mono">v1.0.0</span></div>
                <div className="flex justify-between"><span className="text-ink-400">Prediction Engine</span><span className="text-white">{modelInfo ? modelInfo.algorithm : "Tuned LightGBM (v2)"}</span></div>
                <div className="flex justify-between"><span className="text-ink-400">Model Version</span><span className="text-white font-mono">{modelInfo ? modelInfo.model_version : modelInfoError ? "unavailable (server offline)" : "loading..."}</span></div>
                <div className="flex justify-between"><span className="text-ink-400">Reference Checks</span><span className="text-white">Ridge, CatBoost (sanity check only)</span></div>
                {modelInfo && (
                  <>
                    <div className="flex justify-between"><span className="text-ink-400">Accuracy on unseen test strip</span><span className="text-white font-mono">{modelInfo.frozen_strip_rmse} m RMSE (raw DEM: {modelInfo.raw_dem_rmse_same_strip} m)</span></div>
                    <div className="flex justify-between"><span className="text-ink-400">Improvement vs raw DEM</span><span className="text-white font-mono">{modelInfo.improvement_vs_raw_pct}%</span></div>
                    <div className="flex justify-between"><span className="text-ink-400">Training points / features</span><span className="text-white font-mono">{modelInfo.training_rows.toLocaleString()} / {modelInfo.n_features}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span className="text-ink-400">Ground Truth</span><span className="text-white">ICESat-2</span></div>
                <div className="flex justify-between"><span className="text-ink-400">Primary DEM</span><span className="text-white">CartoDEM</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-ink-700/40">
                  <span className="text-ink-400">Server status</span>
                  {modelInfo ? (
                    <span className="flex items-center gap-1.5 text-signal-teal"><span className="w-1.5 h-1.5 rounded-full bg-signal-teal" /> Operational</span>
                  ) : modelInfoError ? (
                    <span className="flex items-center gap-1.5 text-signal-red"><span className="w-1.5 h-1.5 rounded-full bg-signal-red" /> Server unreachable</span>
                  ) : (
                    <span className="text-ink-400">checking...</span>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          <div className="bg-ink-900/40 border border-ink-700/40 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Reset Settings</h2>
            <p className="text-[12px] text-ink-400 mt-1 mb-3">
              Restore all application preferences to their default values. This does not delete
              datasets, predictions, or any backend data.
            </p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-ink-700 text-ink-300 rounded-lg text-[12px] hover:text-white hover:border-signal-red/50"
              >
                <RotateCcw size={13} /> Restore Defaults
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[12px] text-signal-amber">Restore all settings to their defaults?</p>
                <button onClick={() => setShowResetConfirm(false)} className="px-3 py-1.5 text-[12px] text-ink-400">Cancel</button>
                <button onClick={handleReset} className="px-3 py-1.5 bg-signal-red text-white rounded-lg text-[12px] font-medium">Restore Defaults</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
