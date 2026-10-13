import { useRef, useState } from "react";
import { PanelLeftOpen, Map as MapIcon, Globe as GlobeIcon, Satellite as SatelliteIcon, Video } from "lucide-react";
import MapView from "./MapView";
import Globe3D from "./Globe3D";
import ImageryMap from "./ImageryMap";
import StatsOverlay from "./StatsOverlay";
import LegendPanel from "./LegendPanel";
import SimControls from "./SimControls";
import IssStreamCard from "./IssStreamCard";

const MODES = [
  { id: "2d", label: "2D", icon: MapIcon, title: "2D tracks map" },
  { id: "imagery", label: "Imagery", icon: SatelliteIcon, title: "Live imagery overlay (GIBS / Sentinel Hub)" },
  { id: "3d", label: "3D", icon: GlobeIcon, title: "3D globe — drag to rotate, scroll/pinch to zoom" },
];

export default function MapPane({ satellites, selectedId, onSelect, simClock, onOpenMobilePanel }) {
  const { simTime, speed, setSpeed, running, toggleRunning, resetToNow } = simClock;
  const [viewMode, setViewMode] = useState("2d");
  const [showIssStream, setShowIssStream] = useState(false);
  const containerRef = useRef(null);

  const degraded = satellites.some((s) => s.status === "fallback" || s.status === "unavailable");

  return (
    <div ref={containerRef} className="relative flex-1 h-full min-w-0 overflow-hidden">
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
        <button
          onClick={onOpenMobilePanel}
          className="lg:hidden bg-ink-900/90 border border-ink-700/70 rounded-lg p-2 shadow-panel"
          aria-label="Open mission panel"
        >
          <PanelLeftOpen size={16} className="text-ink-200" />
        </button>

        <div className="flex items-center bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-lg shadow-panel overflow-hidden">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setViewMode(m.id)}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-colors ${
                i > 0 ? "border-l border-ink-700/60" : ""
              } ${viewMode === m.id ? "bg-ink-800 text-white" : "text-ink-400 hover:text-white"}`}
              title={m.title}
            >
              <m.icon size={14} />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowIssStream((s) => !s)}
          className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium rounded-lg border shadow-panel transition-colors ${
            showIssStream
              ? "bg-signal-red/15 text-signal-red border-signal-red/30"
              : "bg-ink-900/90 text-ink-400 border-ink-700/70 hover:text-white backdrop-blur"
          }`}
          title="Toggle ISS live video"
        >
          <Video size={14} />
          <span className="hidden sm:inline">ISS Live</span>
        </button>
      </div>

      {viewMode === "2d" && <MapView satellites={satellites} selectedId={selectedId} onSelect={onSelect} />}
      {viewMode === "imagery" && (
        <ImageryMap satellites={satellites} selectedId={selectedId} onSelect={onSelect} />
      )}
      {viewMode === "3d" && <Globe3D satellites={satellites} selectedId={selectedId} onSelect={onSelect} />}

      <div className="hidden sm:block">
        <StatsOverlay satellites={satellites} selectedId={selectedId} onSelect={onSelect} containerRef={containerRef} />
      </div>
      <div className="hidden lg:block">
        <LegendPanel satellites={satellites} selectedId={selectedId} onSelect={onSelect} containerRef={containerRef} />
      </div>

      <SimControls
        running={running}
        toggleRunning={toggleRunning}
        speed={speed}
        setSpeed={setSpeed}
        resetToNow={resetToNow}
        simTime={simTime}
        containerRef={containerRef}
      />

      {showIssStream && (
        <IssStreamCard containerRef={containerRef} onClose={() => setShowIssStream(false)} />
      )}

      {degraded && (
        <div className="absolute bottom-20 left-4 text-[10px] font-mono text-ink-500 bg-ink-900/80 border border-ink-700/60 rounded-md px-2 py-1 pointer-events-none max-w-[calc(100%-2rem)]">
          Live TLE fetch failed for one or more satellites — showing cached elements where available
        </div>
      )}
    </div>
  );
}
