import { getSettings } from "./settingsStore";

// Speaks text aloud with the browser's built-in speech synthesis, using
// the Voice & Assistant settings (mute, speed, volume, chosen voice).
//
//   speakText(text)                     automatic speech - silent when
//                                       Voice Assistance is turned off
//   speakText(text, lang, { force })    speech the user asked for with a
//                                       button (e.g. "Play answer") - always
//                                       plays, speed/volume/voice still apply
//   options.onend / options.onstart     callbacks
//
// Returns true if speech was started.
export function speakText(text, lang = "en-IN", options = {}) {
  const settings = getSettings();
  if (!settings.voiceEnabled && !options.force) return false;
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = settings.voiceSpeed;
  utterance.volume = settings.voiceVolume;

  if (settings.voiceName) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === settings.voiceName);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
  }

  if (options.onstart) utterance.onstart = options.onstart;
  if (options.onend) {
    utterance.onend = options.onend;
    utterance.onerror = options.onend;
  }
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

// Voices installed in this browser (they load asynchronously in Chrome)
export function listVoices() {
  try {
    return (window.speechSynthesis?.getVoices() || []).map((v) => ({
      name: v.name,
      lang: v.lang,
    }));
  } catch {
    return [];
  }
}
