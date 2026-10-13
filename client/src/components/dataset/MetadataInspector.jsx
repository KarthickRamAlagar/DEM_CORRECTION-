import { useState, useEffect } from "react";
import { X, ChevronRight, Download, UserRound } from "lucide-react";
import StatusBadge from "./StatusBadge";

const TABS = ["Overview", "Schema", "Granules"];

function Field({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[12px]">
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="text-ink-100 font-mono text-right">{value}</span>
    </div>
  );
}

export default function MetadataInspector({ dataset, initialTab = "Overview", onClose, collapsed, onToggleCollapse }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, dataset?.id]);

  if (collapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center w-10 shrink-0 border-l border-ink-700/60 bg-ink-900/60 pt-4">
        <button onClick={onToggleCollapse} className="text-ink-400 hover:text-white p-1.5" title="Expand inspector">
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-[340px] shrink-0 h-full overflow-y-auto bg-ink-900/70 border-l border-ink-700/60">
      <div className="flex items-center justify-between px-4 h-14 border-b border-ink-700/60">
        <h2 className="text-sm font-semibold text-white tracking-wide">Metadata Inspector</h2>
        <div className="flex items-center gap-1">
          <button onClick={onToggleCollapse} className="hidden lg:block text-ink-400 hover:text-white p-1" title="Collapse">
            <ChevronRight size={15} />
          </button>
          {onClose && (
            <button onClick={onClose} className="lg:hidden text-ink-400 hover:text-white p-1" title="Close">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {!dataset ? (
        <div className="px-4 py-8 text-sm text-ink-500 text-center">
          Select a dataset to inspect its metadata.
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <h3 className="font-display font-semibold text-white text-sm truncate">{dataset.name}</h3>
            <div className="mt-1">
              <StatusBadge status={dataset.status} size={12} />
            </div>
          </div>

          <div className="flex gap-1 px-4 mt-3 border-b border-ink-700/60">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "text-white border-signal-teal"
                    : "text-ink-400 border-transparent hover:text-ink-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="px-4 py-4">
            {tab === "Overview" && (
              <div className="divide-y divide-ink-800">
                <Field label="Provider" value={dataset.provider} />
                <Field label="Type" value={dataset.type} />
                <Field label="Records" value={dataset.rows} />
                <Field label="Size" value={dataset.sizeGB} />
                <Field label="CRS" value={dataset.crs} />
                <Field label="Resolution" value={dataset.resolution} />
                <Field label="Bounding box" value={dataset.boundingBox} />
                <Field label="Date range" value={dataset.dateRange} />
                <Field label="Updated" value={dataset.updated} />
                <Field label="License" value={dataset.license} />
                <p className="text-[12px] text-ink-300 leading-relaxed mt-3">{dataset.description}</p>
                <div className="mt-4 pt-3 border-t border-ink-800">
                  <div className="flex items-center gap-2 mb-2">
                    <UserRound size={13} className="text-signal-teal" />
                    <h4 className="text-[11px] uppercase tracking-wide text-ink-400">Author Details</h4>
                  </div>
                  <div className="space-y-1 text-[12px]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-ink-400 shrink-0">Author</span>
                      <span className="text-ink-100 text-right">{dataset.author?.name ?? dataset.provider}</span>
                    </div>
                    {dataset.author?.organization && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-ink-400 shrink-0">Organization</span>
                        <span className="text-ink-100 text-right">{dataset.author.organization}</span>
                      </div>
                    )}
                  </div>
                  {dataset.author?.description && (
                    <p className="text-[12px] text-ink-300 leading-relaxed mt-2">{dataset.author.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-3 !border-t-0">
                  {dataset.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono text-ink-300 bg-ink-800 border border-ink-700 rounded-full px-2 py-0.5"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tab === "Schema" && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-2">
                  Field definitions ({dataset.schema.length})
                </div>
                <div className="space-y-2.5">
                  {dataset.schema.map((f) => (
                    <div key={f.name} className="flex items-center justify-between text-[12px]">
                      <span className="font-mono text-white">{f.name}</span>
                      <span className="text-ink-400">{f.type}</span>
                      <span className="text-ink-500">{f.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "Granules" && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-2">
                  Granules download ({dataset.granuleCount.toLocaleString()})
                </div>
                <div className="space-y-1">
                  {dataset.granules.map((g) => (
                    <button
                      key={g.name}
                      className="w-full flex items-center justify-between gap-2 text-[12px] px-2 py-2 rounded-lg hover:bg-ink-800/70 transition-colors text-left"
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Download size={12} className="text-ink-400 shrink-0" />
                        <span className="font-mono text-ink-200 truncate">{g.name}</span>
                      </span>
                      <span className="text-ink-500 shrink-0">{g.sizeMB} MB</span>
                    </button>
                  ))}
                </div>
                {dataset.granuleCount > dataset.granules.length && (
                  <p className="text-[11px] text-ink-500 mt-2">
                    Showing {dataset.granules.length} of {dataset.granuleCount.toLocaleString()} granules.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
