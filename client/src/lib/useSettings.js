import { useState, useEffect } from "react";
import { getSettings } from "./settingsStore";

// React hook wrapper - re-renders the component whenever settings
// change anywhere in the app, without needing prop-drilling or a
// Context provider wrapping the whole tree
export function useSettings() {
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    const handler = (e) => setSettings(e.detail);
    const onStorage = (e) => {
      if (e.key === "demCorrectionSettings") setSettings(getSettings());
    };
    window.addEventListener("demCorrectionSettingsChanged", handler);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("demCorrectionSettingsChanged", handler);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return settings;
}