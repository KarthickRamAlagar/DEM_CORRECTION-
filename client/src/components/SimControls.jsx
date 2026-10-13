import { Play, Pause, RotateCcw, GripVertical } from "lucide-react";
import { useDraggable } from "../hooks/useDraggable";

const SPEED_PRESETS = [
  { label: "1×", value: 1 },
  { label: "60×", value: 60 },
  { label: "200×", value: 200 },
  { label: "1200×", value: 1200 },
];

export default function SimControls({ running, toggleRunning, speed, setSpeed, resetToNow, simTime, containerRef }) {
  const { panelRef, position, isPlaced, dragHandleProps } = useDraggable({
    containerRef,
    initialCorner: "bottom-left",
  });

  return (
    <div
      ref={panelRef}
      className="absolute flex items-center gap-1.5 bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-xl shadow-panel pl-1.5 pr-2.5 py-2"
      style={{ left: position?.x, top: position?.y, visibility: isPlaced ? "visible" : "hidden" }}
    >
      <span
        className="flex items-center justify-center w-5 h-7 shrink-0 cursor-grab active:cursor-grabbing select-none touch-none text-ink-500"
        {...dragHandleProps}
      >
        <GripVertical size={12} />
      </span>

      <button
        onClick={toggleRunning}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-ink-800 hover:bg-ink-700 text-ink-100 transition-colors shrink-0"
        title={running ? "Pause" : "Play"}
      >
        {running ? <Pause size={13} /> : <Play size={13} />}
      </button>

      <div className="flex items-center rounded-lg bg-ink-800/70 border border-ink-700/60 overflow-hidden shrink-0">
        {SPEED_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setSpeed(p.value)}
            className={`px-2 py-1 text-[10px] font-mono transition-colors ${
              speed === p.value
                ? "bg-signal-teal/20 text-signal-teal"
                : "text-ink-400 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={resetToNow}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-white hover:bg-ink-800 transition-colors shrink-0"
        title="Jump to now"
      >
        <RotateCcw size={13} />
      </button>

      <span className="hidden sm:block text-[10px] font-mono text-ink-400 pl-1 tabular whitespace-nowrap">
        {simTime.toISOString().slice(0, 19).replace("T", " ")} UTC
      </span>
    </div>
  );
}
