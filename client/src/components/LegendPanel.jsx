import { GripVertical } from "lucide-react";
import { useDraggable } from "../hooks/useDraggable";

export default function LegendPanel({ satellites, selectedId, onSelect, containerRef }) {
  const { panelRef, position, isPlaced, dragHandleProps } = useDraggable({
    containerRef,
    initialCorner: "bottom-right",
  });

  return (
    <div
      ref={panelRef}
      className="absolute w-48 bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-xl shadow-panel max-h-72 overflow-hidden flex flex-col"
      style={{ left: position?.x, top: position?.y, visibility: isPlaced ? "visible" : "hidden" }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-2 border-b border-ink-700/60 cursor-grab active:cursor-grabbing select-none touch-none shrink-0"
        {...dragHandleProps}
      >
        <GripVertical size={12} className="text-ink-500 shrink-0" />
        <span className="text-[10px] uppercase tracking-wide text-ink-400">Tracked satellites</span>
      </div>
      <div className="px-3 py-2.5 overflow-y-auto">
        <ul className="space-y-1">
          {satellites.map((sat) => {
            const active = sat.id === selectedId;
            return (
              <li key={sat.id}>
                <button
                  onClick={() => onSelect(sat.id)}
                  className={`w-full flex items-center gap-2 text-[11px] rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${
                    active ? "bg-ink-800" : "hover:bg-ink-800/60"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 border"
                    style={{ backgroundColor: sat.color, borderColor: sat.color }}
                  />
                  <span className={`truncate flex-1 text-left ${active ? "text-white font-medium" : "text-ink-200"}`}>
                    {sat.name}
                  </span>
                  <StatusDot status={sat.status} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5 pt-2 border-t border-ink-700/50 flex items-center gap-2 text-[10px] text-ink-400">
          <svg width="14" height="8" className="shrink-0">
            <line x1="0" y1="4" x2="14" y2="4" stroke="#8a93a3" strokeWidth="1.4" strokeDasharray="2 2" />
          </svg>
          Ground track
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const color =
    status === "live" ? "bg-signal-green" : status === "fallback" ? "bg-signal-amber" : "bg-signal-red";
  const title =
    status === "live" ? "Live TLE" : status === "fallback" ? "Cached TLE" : status === "loading" ? "Loading" : "Unavailable";
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} title={title} />;
}
