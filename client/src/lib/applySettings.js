// Applies the Appearance settings to the page. Runs once before React
// renders (so there is no flash of the wrong theme) and again whenever
// a setting changes.
//
//   data-theme="dark" | "light"   -> colour tokens (see index.css)
//   html.compact                  -> smaller root font size = tighter spacing
//   html.no-anim                  -> CSS animations / transitions off

import { getSettings, SETTINGS_EVENT } from "./settingsStore";

export function resolveTheme(theme) {
  if (theme === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      return "dark";
    }
  }
  return theme === "light" ? "light" : "dark";
}

export function applyAppearance(settings = getSettings()) {
  const root = document.documentElement;
  const theme = resolveTheme(settings.theme);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("compact", !!settings.compactInterface);
  root.classList.toggle("no-anim", settings.animationsEnabled === false);
}

let started = false;

export function initAppearance() {
  applyAppearance();
  if (started) return;
  started = true;

  window.addEventListener(SETTINGS_EVENT, (e) => applyAppearance(e.detail));

  // "system" theme follows the OS setting live
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (getSettings().theme === "system") applyAppearance();
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch {
    /* matchMedia unavailable: fixed theme still works */
  }

  // another browser tab changed the settings
  window.addEventListener("storage", (e) => {
    if (e.key === "demCorrectionSettings") applyAppearance();
  });
}
