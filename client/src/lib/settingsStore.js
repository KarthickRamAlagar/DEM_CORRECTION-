// Shared settings store - a plain localStorage-backed object, not tied
// to React, so non-component files (speakText.js, applySettings.js,
// notificationSound.js) can read it directly. A React hook
// (useSettings.js) re-renders components when a setting changes.
//
// Every key below is consumed by real code (see the "used by" notes).
// Nothing is saved that no code reads.

export const SETTINGS_KEY = "demCorrectionSettings";
export const SETTINGS_EVENT = "demCorrectionSettingsChanged";

export const DEFAULT_SETTINGS = {
  // Voice & Assistant
  voiceEnabled: true,       // used by speakText.js (automatic speech)
  voiceSpeed: 1.0,          // used by speakText.js, 0.5 - 2.0
  voiceVolume: 1.0,         // used by speakText.js, 0 - 1
  voiceName: "",            // used by speakText.js, "" = browser default
  tourAudioEnabled: true,   // used by ApplicationTour.jsx
  soundEffects: true,       // used by notificationSound.js

  // PDF Report - used by generatePdf in NewInputsPage.jsx
  pdfIncludePredictionSummary: true,
  pdfIncludeCorrectionInsight: true,
  pdfIncludeAllFeatures: true,
  pdfIncludeValidation: true,
  pdfIncludeLocation: true,
  pdfDecimalPlaces: 2,

  // Appearance - used by applySettings.js (html class / data-theme)
  theme: "dark",            // "dark" | "light" | "system"
  compactInterface: false,
  animationsEnabled: true,
  sidebarCollapsedDefault: false, // used by App.jsx
};

// Allowed values / ranges. Anything outside is replaced by the default,
// so a corrupted or hand-edited value can never break the app.
const RULES = {
  voiceEnabled: "bool",
  voiceSpeed: { min: 0.5, max: 2 },
  voiceVolume: { min: 0, max: 1 },
  voiceName: "string",
  tourAudioEnabled: "bool",
  soundEffects: "bool",
  pdfIncludePredictionSummary: "bool",
  pdfIncludeCorrectionInsight: "bool",
  pdfIncludeAllFeatures: "bool",
  pdfIncludeValidation: "bool",
  pdfIncludeLocation: "bool",
  pdfDecimalPlaces: { min: 0, max: 4, int: true },
  theme: ["dark", "light", "system"],
  compactInterface: "bool",
  animationsEnabled: "bool",
  sidebarCollapsedDefault: "bool",
};

function cleanValue(key, value) {
  const rule = RULES[key];
  if (rule === "bool") return typeof value === "boolean" ? value : undefined;
  if (rule === "string") return typeof value === "string" ? value.slice(0, 200) : undefined;
  if (Array.isArray(rule)) return rule.includes(value) ? value : undefined;
  if (rule && typeof value === "number" && Number.isFinite(value)) {
    const v = Math.min(rule.max, Math.max(rule.min, value));
    return rule.int ? Math.round(v) : v;
  }
  return undefined;
}

// Keep only known keys with valid values
export function sanitizeSettings(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in input) {
      const v = cleanValue(key, input[key]);
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...sanitizeSettings(JSON.parse(raw)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function broadcast(settings) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
}

export function updateSettings(partial) {
  const updated = { ...getSettings(), ...sanitizeSettings(partial) };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    // storage blocked (private mode / quota): the change still applies
    // for this session through the event below
  }
  broadcast(updated);
  return updated;
}

export function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* ignore */
  }
  broadcast({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

// ---- export / import ------------------------------------------------

export function exportSettingsJson() {
  return JSON.stringify(
    { app: "dem-correction", kind: "settings", version: 1, settings: getSettings() },
    null,
    2
  );
}

// Returns { ok, applied, ignored, error }. Unknown keys and invalid
// values are ignored, never stored.
export function importSettingsJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const source = parsed && typeof parsed === "object" && parsed.settings ? parsed.settings : parsed;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { ok: false, error: "No settings found in that file." };
  }
  const clean = sanitizeSettings(source);
  const applied = Object.keys(clean).length;
  if (applied === 0) return { ok: false, error: "No recognised settings found in that file." };
  const ignored = Object.keys(source).length - applied;
  updateSettings(clean);
  return { ok: true, applied, ignored };
}
