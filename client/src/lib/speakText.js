// // Speaks text aloud using the browser's built-in speech synthesis -
// // replaces the "ting" tone with an actual spoken phrase, as requested
// export function speakText(text, lang = "en-IN") {
//   if (!window.speechSynthesis) return;
//   window.speechSynthesis.cancel();
//   const utterance = new SpeechSynthesisUtterance(text);
//   utterance.lang = lang;
//   window.speechSynthesis.speak(utterance);
// }

import { getSettings } from "./settingsStore";

// Speaks text aloud using the browser's built-in speech synthesis -
// now respects the real Voice & Assistant settings (mute, speed)
export function speakText(text, lang = "en-IN") {
  const settings = getSettings();
  if (!settings.voiceEnabled) return; // muted - real setting, not a placeholder
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = settings.voiceSpeed; // real setting, applied directly
  window.speechSynthesis.speak(utterance);
}