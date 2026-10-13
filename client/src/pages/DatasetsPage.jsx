import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, ChevronDown, Database } from "lucide-react";
import { DATASET_TYPES } from "../data/datasets";
import { fetchDatasets } from "../lib/datasetsApi";
import DatasetCard from "../components/dataset/DatasetCard";
import MetadataInspector from "../components/dataset/MetadataInspector";

const STATUS_FILTERS = [
  { id: "all", label: "All statuses" },
  { id: "healthy", label: "Healthy" },
  { id: "processing", label: "Processing" },
  { id: "error", label: "Error" },
];

// FIX: this dropdown's menu used to be `position: absolute` inside a
// row with `overflow-x-auto` - setting overflow-x forces the browser
// to also clip the y-axis, even though nobody asked it to. The result
// was the dropdown panel getting cut off, showing only a thin sliver
// at the row's bottom edge. A React Portal renders the menu directly
// into document.body instead, positioned using the button's real
// on-screen coordinates - this fully escapes the clipped container,
// regardless of any overflow settings on its ancestors.
function StatusFilterDropdown({ statusFilter, setStatusFilter, statusMenuOpen, setStatusMenuOpen, currentStatusLabel, counts }) {
  const buttonRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (statusMenuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [statusMenuOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setStatusMenuOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
          statusFilter !== "all"
            ? "bg-signal-teal/10 border-signal-teal/40 text-signal-teal"
            : "bg-ink-900/60 border-ink-700/70 text-ink-300 hover:text-white"
        }`}
      >
        {currentStatusLabel}
        {statusFilter !== "all" && ` (${counts.byStatus[statusFilter]})`}
        <ChevronDown size={12} />
      </button>

      {statusMenuOpen &&
        createPortal(
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setStatusMenuOpen(false)}
              aria-label="Close"
            />
            <div
              className="fixed z-50 w-44 bg-ink-900 border border-ink-700 rounded-lg shadow-panel overflow-hidden"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setStatusFilter(s.id);
                    setStatusMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-[12px] hover:bg-ink-800 transition-colors ${
                    statusFilter === s.id ? "text-signal-teal" : "text-ink-200"
                  }`}
                >
                  {s.label}
                  {s.id !== "all" && <span className="text-ink-500 ml-1">({counts.byStatus[s.id]})</span>}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

export default function DatasetsPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [inspectorTab, setInspectorTab] = useState("Overview");
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Real datasets, fetched from the actual pipeline - replaces the
  // static mock array. datasets.js's DATASET_TYPES constant is kept
  // as-is for the filter buttons, since it's just a fixed category
  // list, not the data itself.
  const datasetsQuery = useQuery({
    queryKey: ["datasets"],
    queryFn: fetchDatasets,
  });
  const datasets = datasetsQuery.data ?? [];

  const counts = useMemo(() => {
    const byType = { all: datasets.length };
    DATASET_TYPES.forEach((t) => (byType[t] = datasets.filter((d) => d.type === t).length));
    const byStatus = { all: datasets.length };
    STATUS_FILTERS.slice(1).forEach((s) => (byStatus[s.id] = datasets.filter((d) => d.status === s.id).length));
    return { byType, byStatus };
  }, [datasets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasets.filter((d) => {
      if (typeFilter !== "all" && d.type !== typeFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.subtitle.toLowerCase().includes(q) ||
        d.provider.toLowerCase().includes(q) ||
        d.crs.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q))
      );
    });
  }, [query, typeFilter, statusFilter, datasets]);

  const selected = datasets.find((d) => d.id === selectedId) ?? null;
  const currentStatusLabel = STATUS_FILTERS.find((s) => s.id === statusFilter)?.label;

  const openInspector = (id, tab = "Overview") => {
    setSelectedId(id);
    setInspectorTab(tab);
    setInspectorCollapsed(false);
    setMobileInspectorOpen(true);
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      {/* top bar */}
      <div className="flex items-center gap-4 h-16 px-5 border-b border-ink-700/60 shrink-0">
        <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tracking-[0.15em] text-ink-400 uppercase shrink-0">
          <Database size={14} className="text-signal-teal" />
          GEOINT / Datasets
        </div>
        <div className="relative flex-1 max-w-xl">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search datasets, variables, EPSG..."
            className="w-full bg-ink-900 border border-ink-700 rounded-lg pl-9 pr-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-signal-teal/50"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {datasetsQuery.isLoading && (
            <span className="text-[11px] text-ink-500">Loading real dataset metadata...</span>
          )}
          {datasetsQuery.isError && (
            <span className="text-[11px] text-signal-red">Could not reach the Datasets API</span>
          )}
          {datasetsQuery.isSuccess && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-signal-green bg-signal-green/10 border border-signal-green/30 rounded-full px-2 py-1">
              Live - {datasets.length} real datasets
            </span>
          )}
          <button className="text-ink-400 hover:text-white p-1.5" title="Notifications">
            <Bell size={16} />
          </button>
        </div>
      </div>

      {/* filter row */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-700/60 overflow-x-auto shrink-0">
        <button
          onClick={() => setTypeFilter("all")}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
            typeFilter === "all"
              ? "bg-ink-800 border-ink-600 text-white"
              : "bg-ink-900/60 border-ink-700/70 text-ink-300 hover:text-white"
          }`}
        >
          All Datasets ({counts.byType.all})
        </button>
        {DATASET_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              typeFilter === t
                ? "bg-ink-800 border-ink-600 text-white"
                : "bg-ink-900/60 border-ink-700/70 text-ink-300 hover:text-white"
            }`}
          >
            {t} ({counts.byType[t] ?? 0})
          </button>
        ))}

        <div className="relative shrink-0">
          <StatusFilterDropdown
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusMenuOpen={statusMenuOpen}
            setStatusMenuOpen={setStatusMenuOpen}
            currentStatusLabel={currentStatusLabel}
            counts={counts}
          />
        </div>
      </div>

      {/* body: list + inspector */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-ink-500 py-16">
              No datasets match "{query}".
            </div>
          ) : (
            filtered.map((d) => (
              <DatasetCard
                key={d.id}
                dataset={d}
                isSelected={selectedId === d.id}
                onInspect={() => openInspector(d.id, "Overview")}
                onGranules={() => openInspector(d.id, "Granules")}
                onTags={() => openInspector(d.id, "Overview")}
              />
            ))
          )}
        </div>

        <div className="hidden lg:block">
          <MetadataInspector
            dataset={selected}
            initialTab={inspectorTab}
            collapsed={inspectorCollapsed}
            onToggleCollapse={() => setInspectorCollapsed((c) => !c)}
          />
        </div>

        {mobileInspectorOpen && selected && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
            <button
              aria-label="Close inspector"
              className="flex-1 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileInspectorOpen(false)}
            />
            <div className="w-[88%] max-w-sm h-full shadow-2xl">
              <MetadataInspector
                dataset={selected}
                initialTab={inspectorTab}
                onClose={() => setMobileInspectorOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}