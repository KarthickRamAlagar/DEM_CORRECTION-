import { Plus, Grid3x3, Layers as LayersIcon, RotateCw } from "lucide-react";

function LayerRow({ layer, onToggle, onOpacity }) {
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/70 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
          style={{ backgroundColor: `${layer.color}1a`, borderColor: `${layer.color}55` }}
        >
          <layer.icon size={14} style={{ color: layer.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-medium text-white truncate">{layer.name}</h4>
            <button
              onClick={() => onToggle(layer.id)}
              className={`shrink-0 w-8 h-4.5 rounded-full transition-colors relative ${
                layer.visible ? "bg-signal-teal/70" : "bg-ink-700"
              }`}
              style={{ height: 18 }}
              aria-label={`Toggle ${layer.name}`}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
                  layer.visible ? "left-[17px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-ink-400 truncate mt-0.5">{layer.subtitle}</p>
          {layer.meta && <p className="text-[10px] font-mono text-ink-500 truncate mt-0.5">{layer.meta}</p>}
        </div>
      </div>

      {layer.hasOpacity && (
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[10px] font-mono text-ink-500 w-7 shrink-0">
            {Math.round(layer.opacity * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            onChange={(e) => onOpacity(layer.id, Number(e.target.value))}
            disabled={!layer.visible}
            className="w-full accent-current disabled:opacity-40"
            style={{ color: layer.color, accentColor: layer.color }}
          />
        </div>
      )}
    </div>
  );
}

export default function LayerStackPanel({ layers, onToggle, onOpacity, onNewAoi, className = "" }) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.15em] text-ink-400 font-semibold flex items-center gap-2">
          <LayersIcon size={13} /> Layer Stack
        </h3>
        <button
          onClick={onNewAoi}
          className="flex items-center gap-1 text-[11px] text-ink-300 hover:text-white transition-colors"
          title="Cycle AOI preset"
        >
          <RotateCw size={12} /> New AOI
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {layers.map((l) => (
          <LayerRow key={l.id} layer={l} onToggle={onToggle} onOpacity={onOpacity} />
        ))}

        <button className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-700 py-2.5 text-[12px] text-ink-400 hover:text-white hover:border-ink-600 transition-colors">
          <Plus size={13} /> Add spatial query
        </button>
      </div>
    </div>
  );
}
