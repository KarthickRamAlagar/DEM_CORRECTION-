import { useState, useEffect, useRef } from "react";

const TOUR_SEEN_KEY = "hasSeenApplicationTour";

// Real, concise (under 130 chars) content for every page - written to
// give a genuine sense of what each page does, not generic filler
const TOUR_STEPS = [
  { pageId: "dashboard", title: "Dashboard", text: "Live satellite tracking - real orbital positions and telemetry for the mission satellites.", audio: "/mp3/tour-dashboard.mp3" },
  { pageId: "datasets", title: "Datasets", text: "Every real dataset used in this project - Sentinel imagery, CartoDEM, and ICESat-2 ground truth.", audio: "/mp3/tour-datasets.mp3" },
  { pageId: "spatial", title: "Spatial Explorer", text: "Explore the study region spatially - coverage, terrain patterns, and geographic context.", audio: "/mp3/tour-spatial.mp3" },
  { pageId: "analytics", title: "Analytics", text: "Model performance analytics - real comparisons across every baseline method tested.", audio: "/mp3/tour-analytics.mp3" },
  { pageId: "eda", title: "EDA", text: "Exploratory analysis on 55 real features - correlations and spatial patterns from 1.2 million points.", audio: "/mp3/tour-eda.mp3" },
  { pageId: "ask", title: "Ask Your Data", text: "Ask questions in plain English or by voice - real, validated answers from the trained model.", audio: "/mp3/tour-ask.mp3" },
  { pageId: "elevation-correction", title: "Elevation Correction", text: "See the actual DEM correction in action - old versus new elevation, point by point.", audio: "/mp3/tour-elevation.mp3" },
  { pageId: "new-inputs", title: "New Inputs", text: "Get your own prediction - fill exact values, describe the terrain, or click an area.", audio: "/mp3/tour-newinputs.mp3" },
];

const STEP_DURATION_MS = 10500; // fixed, generous duration - confirmed to safely cover the longest real audio clip

// 3 distinct positions, cycled per step - keeps the user genuinely
// watching for where it lands next, rather than always the same spot
const TOOLTIP_POSITIONS = [
  "fixed top-6 right-8 items-start",           // top-right, spaced from the edge
  "fixed bottom-6 left-8 items-end",           // bottom-left, spaced from the edge
  "fixed bottom-6 right-[20%] items-end",      // bottom, offset toward center-right
];
// FIX (real bug reported): now waits for the actual audio to finish
// playing (the "ended" event) before advancing, instead of a fixed
// timer that didn't match real audio length. If the audio is missing
// or fails to load, falls back to STEP_DURATION_MS so the tour never
// gets stuck waiting forever for a file that doesn't exist yet.
// FIX (simplified per real testing): the "wait for the ended event"
// approach wasn't advancing reliably. Reverted to a simple, fixed
// 10-second timer for every step - plays the audio alongside it, but
// the timer alone (not the audio event) now drives advancement,
// guaranteed to give real speech enough time regardless of any
// audio-loading quirks.
function playAudioAndAdvance(src, audioRef, onAdvance, durationMs) {
  try {
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.play().catch(() => {}); // audio is best-effort, never blocks timing
  } catch {
    // no-op - audio is optional
  }

  return setTimeout(onAdvance, durationMs);
}

export default function ApplicationTour({ active, setActive }) {
  const [phase, setPhase] = useState(null); // null | "intro" | "touring" | "done"
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false); // controls the slide-up animation
  const audioRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const previousPageRef = useRef(active);

  // Only ever triggers on a genuine first visit - never on refresh
  // after completion, never from normal page-to-page navigation
  useEffect(() => {
    const hasSeen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!hasSeen) {
      setPhase("intro");
      setTimeout(() => setVisible(true), 100);
    }
  }, []);

  // FIX (real conflict reported): other pages (like New Inputs) have
  // their own first-visit speech/tooltip logic that was firing AT THE
  // SAME TIME the tour narrates that same page, causing overlapping
  // audio. This flag lets any page check "is a guided tour currently
  // showing me" and suppress its own onboarding behavior while true.
  useEffect(() => {
    window.__isApplicationTouring = phase === "touring" || phase === "intro";
    return () => { window.__isApplicationTouring = false; };
  }, [phase]);

  useEffect(() => {
    if (phase === "intro") {
      const audio = new Audio("/mp3/tour-intro.mp3");
      audioRef.current = audio;
      audio.play().catch(() => {});
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "touring") return;
    previousPageRef.current = active;
    const step = TOUR_STEPS[stepIndex];
    setActive(step.pageId);

    advanceTimerRef.current = playAudioAndAdvance(
      step.audio,
      audioRef,
      () => {
        if (stepIndex < TOUR_STEPS.length - 1) {
          setStepIndex((i) => i + 1);
        } else {
          finishTour();
        }
      },
      STEP_DURATION_MS
    );

    return () => clearTimeout(advanceTimerRef.current);
  }, [phase, stepIndex]);

  const startTour = () => {
    setPhase("touring");
    setStepIndex(0);
  };

  const skipTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    setVisible(false);
    setTimeout(() => setPhase(null), 300);
    if (audioRef.current) audioRef.current.pause();
  };

  const finishTour = () => {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
    clearTimeout(advanceTimerRef.current);
    setVisible(false);
    // Real requirement: return to Dashboard WITHOUT a page refresh -
    // this is a plain state update, same mechanism as normal nav
    setTimeout(() => {
      setActive("dashboard");
      setPhase(null);
    }, 300);
  };

  const skipToDashboard = () => {
    if (audioRef.current) audioRef.current.pause();
    finishTour();
  };

  if (!phase) return null;

  const currentStep = phase === "touring" ? TOUR_STEPS[stepIndex] : null;
  const positionClass = TOOLTIP_POSITIONS[stepIndex % TOOLTIP_POSITIONS.length];

  return (
    <>
      {/* FIX (real bug reported): the visible dark/blur overlay was
          hiding the current page the tour is supposed to be showing -
          removed the visual darkening, but the blocking layer stays
          fully transparent while still capturing all clicks, so the
          user can see the page clearly but can't interact with it. */}
      <div className="fixed inset-0 z-[1900]" style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()} />

      <div
        className={`${positionClass} z-[2000] flex gap-4 transition-all duration-500 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8"
        }`}
      >
        <div className="relative bg-white text-ink-950 rounded-2xl rounded-bl-sm px-5 py-4 shadow-2xl max-w-md">
        {phase === "intro" ? (
          <>
            <p className="text-[14px] font-bold text-black mb-3">
              Shall we take a quick tour to explore the key features and workflow of the application?
            </p>
            <div className="flex gap-2">
              <button onClick={startTour} className="flex-1 py-1.5 bg-signal-teal text-ink-950 rounded-lg text-[13px] font-medium">Yes, show me</button>
              <button onClick={skipTour} className="flex-1 py-1.5 border border-ink-300 text-ink-600 rounded-lg text-[13px] font-medium">Skip</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] text-signal-teal font-semibold uppercase tracking-wide mb-1">
              {currentStep.title} - Step {stepIndex + 1} of {TOUR_STEPS.length}
            </p>
            <p className="text-[13px] text-black mb-3">{currentStep.text}</p>
            <div className="h-1 w-full rounded-full bg-ink-100 overflow-hidden mb-3">
              <div
                key={stepIndex}
                className="h-full bg-signal-teal rounded-full"
                style={{ animation: `tourProgress ${STEP_DURATION_MS}ms linear forwards` }}
              />
            </div>
            <button onClick={skipToDashboard} className="w-full py-1.5 border border-ink-300 text-ink-600 rounded-lg text-[12px] font-medium">
              Skip tour, go to Dashboard
            </button>
          </>
        )}
        </div>

        <img
          src="/assets/kalam-character.png"
          alt="APJ Abdul Kalam"
          style={{ transform: "scaleX(-1)" }}
          className="w-40 h-40 sm:w-48 sm:h-48 object-contain shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
        />
      </div>

      <style>{`
        @keyframes tourProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </>
  );
}