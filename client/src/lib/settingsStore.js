// Shared settings store - a plain localStorage-backed object, not tied
// to React, so non-component files (like speakText.js) can read it
// directly. A React hook is also exported for components that need to
// re-render reactively when a setting changes.

const SETTINGS_KEY = "demCorrectionSettings";

export const DEFAULT_SETTINGS = {
  // Voice & Assistant - real, wired into speakText.js
  voiceEnabled: true,
  voiceSpeed: 1.0, // 0.5 - 2.0

  // PDF Report - real, wired into generatePdf in NewInputsPage.jsx
  pdfIncludePredictionSummary: true,
  pdfIncludeCorrectionInsight: true,
  pdfIncludeAllFeatures: true,
  pdfIncludeValidation: true,
  pdfIncludeLocation: true,
  pdfDecimalPlaces: 2,

  // Appearance - real, wired via a global CSS class
  compactInterface: false,
  animationsEnabled: true,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("demCorrectionSettingsChanged", { detail: updated }));
  return updated;
}

export function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  window.dispatchEvent(new CustomEvent("demCorrectionSettingsChanged", { detail: DEFAULT_SETTINGS }));
  return { ...DEFAULT_SETTINGS };
}