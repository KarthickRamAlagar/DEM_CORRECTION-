import { Activity, GripVertical } from "lucide-react";
import { getSubpointRegion } from "../lib/geoRegions";
import { useDraggable } from "../hooks/useDraggable";

export default function StatsOverlay({ satellites, selectedId, onSelect, containerRef }) {
  const { panelRef, position, isPlaced, dragHandleProps } = useDraggable({
    containerRef,
    initialCorner: "top-right",
  });

  return (
    <div
      ref={panelRef}
      className="absolute w-64 max-w-[75vw] bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-xl shadow-panel overflow-hidden"
      style={{ left: position?.x, top: position?.y, visibility: isPlaced ? "visible" : "hidden" }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-2.5 border-b border-ink-700/60 cursor-grab active:cursor-grabbing select-none touch-none"
        {...dragHandleProps}
      >
        <GripVertical size={12} className="text-ink-500 shrink-0" />
        <Activity size={13} className="text-signal-teal shrink-0" />
        <span className="text-[11px] font-semibold text-white tracking-wide">Live Telemetry</span>
      </div>
      <div className="divide-y divide-ink-700/50">
        {satellites.map((sat) => {
          const active = sat.id === selectedId;
          const region = sat.position ? getSubpointRegion(sat.position.lat, sat.position.lon) : null;
          return (
            <button
              key={sat.id}
              onClick={() => onSelect(sat.id)}
              className={`w-full text-left px-3.5 py-2 text-[11px] transition-colors ${
                active ? "bg-ink-800/80" : "hover:bg-ink-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 ${active ? "text-white font-medium" : "text-ink-200"}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sat.color }} />
                  {sat.short}
                </span>
                {sat.position ? (
                  <span className="font-mono text-ink-100 tabular">{sat.position.altKm.toFixed(0)} km</span>
                ) : (
                  <span className="font-mono text-ink-500">—</span>
                )}
              </div>
              {sat.position && (
                <div className="flex items-center justify-between mt-0.5 text-[10px] text-ink-400 font-mono tabular">
                  <span>{region}</span>
                  <span>{sat.position.speedKmS ? `${sat.position.speedKmS.toFixed(2)} km/s` : ""}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
