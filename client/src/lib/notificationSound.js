// Plays a short two-tone "ting" using the Web Audio API directly -
// no external audio file to source/host, works reliably in any modern
// browser, and needs zero network request.

import { getSettings } from "./settingsStore";

export function playTingSound() {
  if (!getSettings().soundEffects) return; // Settings > Voice & Assistant > Sound effects
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();

    const playTone = (frequency, startTime, duration) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.15);       // first "ting" note
    playTone(1318.5, now + 0.12, 0.25); // second, higher note - classic two-tone chime
  } catch (e) {
    console.warn("Could not play notification sound:", e);
  }
}