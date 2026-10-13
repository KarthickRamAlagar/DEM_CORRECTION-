import { ChevronDown, MapPin, Loader2, AlertTriangle, GripVertical } from "lucide-react";
import BandChart from "./BandChart";
import { useDraggable } from "../../hooks/useDraggable";

function ElevationValue({ sample }) {
  if (sample.elevationStatus === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-ink-400">
        <Loader2 size={11} className="animate-spin" /> fetching…
      </span>
    );
  }
  if (sample.elevationStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-signal-red" title="Elevation API request failed">
        <AlertTriangle size={11} /> unavailable
      </span>
    );
  }
  return <span className="font-mono text-signal-gold">{sample.elevationM?.toFixed(1)} m</span>;
}

export default function SpatialInspector({ sample, collapsed, onToggleCollapse, containerRef }) {
  const { panelRef, position, isPlaced, dragHandleProps } = useDraggable({
    containerRef,
    initialCorner: "bottom-left",
  });

  return (
    <div
      ref={panelRef}
      className="absolute z-[900] w-[420px] max-w-[90vw] bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-xl shadow-panel overflow-hidden"
      style={{ left: position?.x, top: position?.y, visibility: isPlaced ? "visible" : "hidden" }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-2.5 border-b border-ink-700/60 cursor-grab active:cursor-grabbing select-none touch-none"
        {...dragHandleProps}
      >
        <GripVertical size={12} className="text-ink-500 shrink-0" />
        <MapPin size={13} className="text-signal-teal shrink-0" />
        <span className="text-[11px] font-semibold text-white tracking-wide flex-1">Spatial Inspector</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleCollapse}
          className="text-ink-400 hover:text-white p-0.5"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown size={14} className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-3">
          {!sample ? (
            <p className="text-[12px] text-ink-500 py-3 text-center">
              Click anywhere on the map to sample that point.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
                <span className="text-ink-400">
                  Lat: <span className="font-mono text-white">{sample.lat.toFixed(4)}°</span>
                </span>
                <span className="text-ink-400">
                  Lon: <span className="font-mono text-white">{sample.lon.toFixed(4)}°</span>
                </span>
                <span className="text-ink-400">
                  Elevation: <ElevationValue sample={sample} />
                </span>
              </div>

              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
                  Band signature (illustrative)
                </div>
                <BandChart bands={sample.bands} />
              </div>

              <p className="text-[10px] text-ink-500 mt-2">
                Elevation: live from Open-Meteo (Copernicus DEM)
                {sample.processingTimeMs != null && ` · ${sample.processingTimeMs} ms`}. Band signature above is a
                mock pattern, not a real raster query.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
