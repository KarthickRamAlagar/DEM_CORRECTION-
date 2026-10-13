import { useState, useEffect } from "react";
import { getSettings } from "./settingsStore";

// React hook wrapper - re-renders the component whenever settings
// change anywhere in the app, without needing prop-drilling or a
// Context provider wrapping the whole tree
export function useSettings() {
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    const handler = (e) => setSettings(e.detail);
    window.addEventListener("demCorrectionSettingsChanged", handler);
    return () => window.removeEventListener("demCorrectionSettingsChanged", handler);
  }, []);

  return settings;
}