import { useState } from "react";
import PlaceMap from "./PlaceMap";
import BhuvanView from "./BhuvanView";

const TABS = [
  { id: "2d", label: "2D map" },
  { id: "bhuvan", label: "Bhuvan (ISRO)" },
];

export default function MapTabs({ point, radiusKm, overlay, onPick }) {
  const [tab, setTab] = useState("2d");
  return (
    <div>
      <div className="mb-2 inline-flex rounded-lg border border-ink-700/70 bg-ink-900/60 p-0.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-md text-[12px] font-medium ${tab === t.id ? "bg-ink-700 text-white" : "text-ink-300 hover:text-white"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "2d" && <PlaceMap point={point} radiusKm={radiusKm} overlay={overlay} onPick={onPick} />}
      {tab === "bhuvan" && <BhuvanView point={point} radiusKm={radiusKm} onPick={onPick} />}
    </div>
  );
}
