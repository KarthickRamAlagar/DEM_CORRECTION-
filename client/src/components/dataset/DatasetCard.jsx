import { Search, Layers, Tag } from "lucide-react";
import StatusBadge from "./StatusBadge";
import DatasetThumb from "./DatasetThumb";

function isRecentlyUpdated(dateStr) {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  return days < 14;
}

export default function DatasetCard({ dataset, isSelected, onInspect, onGranules, onTags }) {
  const recent = isRecentlyUpdated(dataset.updated);

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-4 transition-colors cursor-pointer ${
        isSelected
          ? "bg-ink-800/80 border-signal-teal/40"
          : "bg-ink-900/70 border-ink-700/70 hover:border-ink-600"
      }`}
      onClick={onInspect}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-white text-base truncate">{dataset.name}</h3>
          {recent && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-signal-teal bg-signal-teal/10 border border-signal-teal/30 rounded-full px-2 py-0.5 shrink-0">
              New
            </span>
          )}
        </div>
        <p className="text-sm text-ink-300 mt-0.5 truncate">{dataset.subtitle}</p>
        <p className="text-[12px] text-ink-500 mt-1.5 font-mono truncate">
          {dataset.provider} · {dataset.rows} · {dataset.sizeGB} · {dataset.crs}
        </p>

        <div className="flex items-center gap-4 mt-3">
          <StatusBadge status={dataset.status} />

          <div className="h-4 w-px bg-ink-700" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-white transition-colors"
          >
            <Search size={13} /> Inspect
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGranules();
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-white transition-colors"
          >
            <Layers size={13} /> Granules
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTags();
            }}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-white transition-colors"
          >
            <Tag size={13} /> Tags
          </button>
        </div>
      </div>

      <DatasetThumb type={dataset.type} className="hidden sm:block w-32 h-20 shrink-0" />
    </div>
  );
}
