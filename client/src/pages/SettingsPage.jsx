import { useState, useEffect } from "react";
import { Mic, FileText, Palette, RotateCcw, Info } from "lucide-react";
import { useSettings } from "../lib/useSettings";
import { updateSettings, resetSettings } from "../lib/settingsStore";

const MODEL_INFO_URL = "http://localhost:8000/api/model/info";

const NAV_ITEMS = [
  { id: "voice", label: "Voice & Assistant", icon: Mic },
  { id: "pdf", label: "PDF Report", icon: FileText },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "about", label: "About", icon: Info },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-signal-teal" : "bg-ink-700"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
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

export default function SettingsPage() {
  const settings = useSettings();
  const [activeSection, setActiveSection] = useState("voice");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelInfoError, setModelInfoError] = useState(false);

  // About tab reads the real model facts from the server's registry (nothing hard-coded)
  useEffect(() => {
    fetch(MODEL_INFO_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then(setModelInfo)
      .catch(() => setModelInfoError(true));
  }, []);

  const set = (key, value) => {
    updateSettings({ [key]: value });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleReset = () => {
    resetSettings();
    setShowResetConfirm(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[11px] font-mono tracking-[0.15em] uppercase text-ink-400">GEOINT / Settings</p>
          <h1 className="mt-1 font-display text-xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-ink-400">Configure your DEM-Correction workspace</p>
        </div>
        {savedFlash && (
          <span className="text-[12px] text-signal-teal flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-teal" /> Settings saved
          </span>
        )}
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
            <SectionCard title="Voice & Assistant" description="Configure voice feedback for prediction results and guided tooltips.">
              <SettingRow title="Voice Assistance" description="Enable spoken feedback throughout the application.">
                <Toggle checked={settings.voiceEnabled} onChange={(v) => set("voiceEnabled", v)} />
              </SettingRow>
              <SettingRow title="Voice Speed" description="Adjust how fast spoken responses are read.">
                <div className="flex items-center gap-2 w-40">
                  <input
                    type="range" min="0.5" max="2" step="0.1"
                    value={settings.voiceSpeed}
                    onChange={(e) => set("voiceSpeed", parseFloat(e.target.value))}
                    className="w-full accent-signal-teal"
                  />
                  <span className="text-[12px] text-ink-400 font-mono w-8">{settings.voiceSpeed.toFixed(1)}x</span>
                </div>
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "pdf" && (
            <SectionCard title="PDF Report" description="Customize the information included in generated prediction reports.">
              <SettingRow title="Include Prediction Summary" description="The numerical comparison box at the top of page 1.">
                <Toggle checked={settings.pdfIncludePredictionSummary} onChange={(v) => set("pdfIncludePredictionSummary", v)} />
              </SettingRow>
              <SettingRow title="Include Correction Insight" description="The plain-language explanation of the correction applied.">
                <Toggle checked={settings.pdfIncludeCorrectionInsight} onChange={(v) => set("pdfIncludeCorrectionInsight", v)} />
              </SettingRow>
              <SettingRow title="Include All Feature Values" description="The full terrain, vegetation, radar, and location tables.">
                <Toggle checked={settings.pdfIncludeAllFeatures} onChange={(v) => set("pdfIncludeAllFeatures", v)} />
              </SettingRow>
              <SettingRow title="Include Validation Metrics" description="Model name, validated RMSE, and confidence.">
                <Toggle checked={settings.pdfIncludeValidation} onChange={(v) => set("pdfIncludeValidation", v)} />
              </SettingRow>
              <SettingRow title="Include Location Information" description="Real location and coordinates, if a point was picked.">
                <Toggle checked={settings.pdfIncludeLocation} onChange={(v) => set("pdfIncludeLocation", v)} />
              </SettingRow>
              <SettingRow title="Decimal Places" description="Precision for numerical values shown in the PDF.">
                <select
                  value={settings.pdfDecimalPlaces}
                  onChange={(e) => set("pdfDecimalPlaces", parseInt(e.target.value, 10))}
                  className="bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[13px] text-white"
                >
                  {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </SettingRow>
            </SectionCard>
          )}

          {activeSection === "appearance" && (
            <SectionCard title="Appearance & Interface" description="Customize the visual behavior of the workspace.">
              <SettingRow title="Theme" description="Dark is fully supported everywhere. Light mode is saved as a real preference but most pages haven't been visually built for it yet, so it will look incomplete.">
                <div className="flex gap-1.5">
                  {["dark", "light", "system"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => set("theme", opt)}
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
                <Toggle checked={settings.compactInterface} onChange={(v) => set("compactInterface", v)} />
              </SettingRow>
              <SettingRow title="Animations" description="Enable interface and transition animations.">
                <Toggle checked={settings.animationsEnabled} onChange={(v) => set("animationsEnabled", v)} />
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
                  <span className="text-ink-400">Status</span>
                  <span className="flex items-center gap-1.5 text-signal-teal"><span className="w-1.5 h-1.5 rounded-full bg-signal-teal" /> Operational</span>
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