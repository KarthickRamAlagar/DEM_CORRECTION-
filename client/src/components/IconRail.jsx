import {
  LayoutDashboard,
  Database,
  Radar,
  BarChart3,
  Sparkles,
  MessageCircleQuestion,
  Settings,
  ChevronLeft,
  Layers,
  TextCursorInput,
} from "lucide-react";
import { navItems } from "../data/mockData";

const ICONS = {
  dashboard: LayoutDashboard,
  datasets: Database,
  spatial: Radar,
  eda: Sparkles,
  ask: MessageCircleQuestion,
  "elevation-correction": Layers, 
  "new-inputs": TextCursorInput,
  evaluation: BarChart3,
   "settings": Settings,
};

export default function IconRail({ active, onSelect, collapsed, onToggleCollapse }) {
  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 bg-ink-950 border-r border-ink-700/60 h-full transition-all duration-200 ${
        collapsed ? "w-[68px]" : "w-56"
      }`}
    >
      <div className="flex items-center gap-2 px-4 h-16 border-b border-ink-700/60">
        <div className="w-7 h-7 rounded-md bg-signal-teal/15 border border-signal-teal/40 flex items-center justify-center">
          <Radar size={15} className="text-signal-teal" strokeWidth={2} />
        </div>
        {!collapsed && (
          <span className="font-mono text-[11px] tracking-[0.2em] text-ink-300 uppercase">
            Workspace
          </span>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-ink-800 text-white border border-ink-600/70"
                  : "text-ink-300 hover:text-white hover:bg-ink-900 border border-transparent"
              }`}
              title={item.label}
            >
              <Icon size={17} strokeWidth={1.8} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-ink-700/60 space-y-1">
       
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center rounded-lg px-3 py-2 text-ink-400 hover:text-white hover:bg-ink-900"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronLeft
            size={16}
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </aside>
  );
}