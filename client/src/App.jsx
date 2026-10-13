import { useState } from "react";
import { LayoutDashboard, Database, Radar, BarChart3, Sparkles, MessageCircleQuestion, Layers,TextCursorInput,Settings } from "lucide-react";
import IconRail from "./components/IconRail";
import SatellitePanel from "./components/SatellitePanel";
import MapPane from "./components/MapPane";
import DatasetsPage from "./pages/DatasetsPage";
import SpatialExplorerPage from "./pages/SpatialExplorerPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import EDAPage from "./pages/EDAPage";
import AskYourDataPage from "./pages/AskYourDataPage";
import { navItems } from "./data/mockData";
import { DEFAULT_SATELLITE_ID } from "./data/satelliteCatalog";
import { useTleCatalog } from "./hooks/useTleCatalog";
import { useSimClock } from "./hooks/useSimClock";
import { useLivePositions } from "./hooks/useLivePositions";
import ElevationCorrectionPage from "./pages/ElevationCorrectionPage";
import NewInputsPage from "./pages/NewInputsPage.jsx";
import ApplicationTour from "./components/ApplicationTour";
import SettingsPage from "./pages/SettingsPage";

const MOBILE_ICONS = {
  dashboard: LayoutDashboard,
  datasets: Database,
  spatial: Radar,
  analytics: BarChart3,
  eda: Sparkles,
  ask: MessageCircleQuestion,
  "elevation-correction": Layers,
  "new-inputs": TextCursorInput,
   settings: Settings, 
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(DEFAULT_SATELLITE_ID);

  const tleEntries = useTleCatalog();
  const simClock = useSimClock(200);
  const satellites = useLivePositions(tleEntries, simClock.simTime);

  const handleSelect = (id) => {
    setSelectedId(id);
    setMobilePanelOpen(true);
  };

  return (
    <div className="h-screen w-screen flex bg-ink-950 text-ink-100 overflow-hidden">
      <IconRail
        active={active}
        onSelect={setActive}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <ApplicationTour active={active} setActive={setActive} />

      {active === "dashboard" && (
        <>
          <div className="hidden lg:block w-[380px] xl:w-[400px] shrink-0 h-full">
            <SatellitePanel satellites={satellites} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {mobilePanelOpen && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              <div className="w-[86%] max-w-sm h-full shadow-2xl">
                <SatellitePanel satellites={satellites} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
              <button
                aria-label="Close panel"
                className="flex-1 bg-black/60 backdrop-blur-sm"
                onClick={() => setMobilePanelOpen(false)}
              />
            </div>
          )}

          <MapPane
            satellites={satellites}
            selectedId={selectedId}
            onSelect={handleSelect}
            simClock={simClock}
            onOpenMobilePanel={() => setMobilePanelOpen(true)}
          />
        </>
      )}

      {active === "datasets" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <DatasetsPage />
        </div>
      )}

      {active === "spatial" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <SpatialExplorerPage satellites={satellites} />
        </div>
      )}

      {active === "analytics" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <AnalyticsPage />
        </div>
      )}

      {active === "eda" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <EDAPage />
        </div>
      )}

      {active === "ask" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <AskYourDataPage />
        </div>
      )}
      
      {active === "elevation-correction" && (
        <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
          <ElevationCorrectionPage />
        </div>
      )}

       {active === "new-inputs" && (
          <div className="flex-1 min-w-0 h-full pb-14 lg:pb-0">
            <NewInputsPage />
          </div>
        )}
        {active === "settings" && <SettingsPage />}

      

      {/* bottom tab bar on small screens, mirrors the icon rail */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-ink-950/95 backdrop-blur border-t border-ink-700/70 flex justify-around py-2">
        {navItems.map((item) => {
          const Icon = MOBILE_ICONS[item.id];
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1 text-[10px] ${
                isActive ? "text-signal-teal" : "text-ink-400"
              }`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}