import { useState } from "react";
import { GripVertical, X, Minimize2, Maximize2, ExternalLink } from "lucide-react";
import { useDraggable } from "../hooks/useDraggable";

// HDEV (the old External High Definition Earth-Viewing experiment the
// ustream.tv link pointed to) stopped transmitting in 2019 and was formally
// retired that August — that URL is dead. NASA's live ISS Earth-view camera
// (mounted on the Harmony module) now streams through YouTube instead. This
// is the current official video ID as of this build; if NASA rotates it,
// grab the fresh one from https://www.youtube.com/@NASA/live.
const ISS_LIVE_EMBED_URL =
  "https://www.youtube.com/embed/awQzjn72bI0?autoplay=1&mute=1&playsinline=1";
const ISS_LIVE_WATCH_URL = "https://www.youtube.com/watch?v=awQzjn72bI0";

export default function IssStreamCard({ containerRef, onClose }) {
  const [minimized, setMinimized] = useState(false);
  const { panelRef, position, isPlaced, dragHandleProps } = useDraggable({
    containerRef,
    initialCorner: "bottom-left",
    margin: 20,
  });

  return (
    <div
      ref={panelRef}
      className="absolute w-72 bg-ink-900/95 backdrop-blur border border-ink-700/70 rounded-xl shadow-panel overflow-hidden z-[1200]"
      style={{ left: position?.x, top: position?.y, visibility: isPlaced ? "visible" : "hidden" }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-2 border-b border-ink-700/60 cursor-grab active:cursor-grabbing select-none touch-none"
        {...dragHandleProps}
      >
        <GripVertical size={12} className="text-ink-500 shrink-0" />
        <span className="w-1.5 h-1.5 rounded-full bg-signal-red animate-pulse shrink-0" />
        <span className="text-[11px] font-semibold text-white tracking-wide flex-1">ISS Live</span>

        <a
          href={ISS_LIVE_WATCH_URL}
          target="_blank"
          rel="noreferrer"
          className="text-ink-400 hover:text-white p-1"
          title="Open on YouTube"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
        <button
          className="text-ink-400 hover:text-white p-1"
          title={minimized ? "Expand" : "Minimize"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((m) => !m)}
        >
          {minimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
        </button>
        {onClose && (
          <button
            className="text-ink-400 hover:text-white p-1"
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {!minimized && (
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={ISS_LIVE_EMBED_URL}
            title="Live views from the International Space Station"
            frameBorder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {!minimized && (
        <div className="px-2.5 py-1.5 text-[10px] text-ink-500">
          External HD camera, Harmony module — goes dark on the night side of each orbit.
        </div>
      )}
    </div>
  );
}
