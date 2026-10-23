// import { useState, useEffect } from "react";
// import { MapContainer, TileLayer, CircleMarker, Rectangle, useMapEvents } from "react-leaflet";
// import "leaflet/dist/leaflet.css";
// import { AlertCircle, CheckCircle2, Target, BarChart3, Eye } from "lucide-react";
// import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "./ImageryOverlayLayer";

// const DEM_API = "http://localhost:8000/api/dem";

// function FitToBounds({ bounds }) {
//   const map = useMapEvents({});
//   useEffect(() => {
//     if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
//   }, [bounds, map]);
//   return null;
// }

// function StatCard({ icon: Icon, iconBg, iconColor, label, value, valueColor, sublabel }) {
//   return (
//     <div className="flex-1 bg-ink-900/60 border border-ink-700/60 rounded-xl px-4 py-3 flex items-start gap-3">
//       <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
//         <Icon size={16} className={iconColor} />
//       </div>
//       <div>
//         <p className="text-[12px] text-ink-400">{label}</p>
//         <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
//         <p className="text-[11px] text-ink-500 mt-0.5">{sublabel}</p>
//       </div>
//     </div>
//   );
// }

// export default function ErrorPointsDashboard({ year = 2022 }) {
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     setLoading(true);
//     setError(null);
//     fetch(`${DEM_API}/error-points/${year}?sample_size=300`)
//       .then((res) => {
//         if (!res.ok) throw new Error(`Server returned ${res.status}`);
//         return res.json();
//       })
//       .then((d) => {
//         setData(d);
//         setLoading(false);
//       })
//       .catch((err) => {
//         setError(err.message);
//         setLoading(false);
//       });
//   }, [year]);

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-full text-ink-400 text-sm">
//         Computing real error points from the model - this samples real data and runs
//         predictions, may take a moment...
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="flex items-center justify-center h-full text-signal-red text-sm">
//         Could not load error points: {error}
//       </div>
//     );
//   }

//   const { points, total_error_points, corrected_points, remaining_error_points, reduction_pct, avg_correction_m } = data;

//   const oldErrorPoints = points.filter((p) => p.was_error_point);
//   const newStatusPoints = points.filter((p) => p.was_error_point); // same points, colored by new status

//   const lats = points.map((p) => p.lat);
//   const lngs = points.map((p) => p.lng);
//   const bounds = [
//     [Math.min(...lats), Math.min(...lngs)],
//     [Math.max(...lats), Math.max(...lngs)],
//   ];

//   return (
//     <div className="flex flex-col h-full w-full overflow-y-auto">
//       {/* Real, computed summary stats - not placeholder numbers */}
//       <div className="flex gap-3 px-6 pt-4">
//         <StatCard
//           icon={AlertCircle} iconBg="bg-signal-red/15" iconColor="text-signal-red"
//           label="Total Error Points (Old Map)" value={total_error_points}
//           valueColor="text-signal-red" sublabel={`Points with error beyond ${data.threshold_m}m`}
//         />
//         <StatCard
//           icon={CheckCircle2} iconBg="bg-signal-teal/15" iconColor="text-signal-teal"
//           label="Corrected Points (New Map)" value={corrected_points}
//           valueColor="text-signal-teal" sublabel="Successfully brought under threshold"
//         />
//         <StatCard
//           icon={Target} iconBg="bg-signal-teal/15" iconColor="text-signal-teal"
//           label="Reduction in Error Points" value={`${reduction_pct}%`}
//           valueColor="text-signal-teal" sublabel={`${total_error_points} -> ${remaining_error_points} remaining`}
//         />
//         <StatCard
//           icon={BarChart3} iconBg="bg-ink-700/40" iconColor="text-ink-300"
//           label="Avg Elevation Error (Old -> New)" value={`${avg_correction_m}m`}
//           valueColor="text-white" sublabel="Mean correction applied"
//         />
//       </div>

//       {/* Two maps: old-method error points (red) vs new-method status (green/red) */}
//       <div className="flex gap-4 px-6 py-4 flex-1 min-h-[400px]">
//         <div className="flex-1 flex flex-col">
//           <div className="flex items-center gap-2 mb-2">
//             <AlertCircle size={16} className="text-signal-red" />
//             <span className="text-sm font-semibold text-white">Elevation Error (Old Method)</span>
//             <span className="ml-auto text-[11px] text-signal-red">Error Points: {total_error_points}</span>
//           </div>
//           <div className="flex-1 rounded-xl overflow-hidden border border-ink-700/60">
//             <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
//               <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
//               <Rectangle bounds={bounds} pathOptions={{ color: "#94a3b8", weight: 1.5, fill: false }} />
//               {oldErrorPoints.map((p, i) => (
//                 <CircleMarker key={i} center={[p.lat, p.lng]} radius={4}
//                   pathOptions={{ color: "#f87171", fillColor: "#f87171", fillOpacity: 0.8 }} />
//               ))}
//               <FitToBounds bounds={bounds} />
//             </MapContainer>
//           </div>
//         </div>

//         <div className="flex-1 flex flex-col">
//           <div className="flex items-center gap-2 mb-2">
//             <CheckCircle2 size={16} className="text-signal-teal" />
//             <span className="text-sm font-semibold text-white">Elevation Error (Proposed Method)</span>
//             <span className="ml-auto text-[11px] text-signal-teal">Remaining Error Points: {remaining_error_points}</span>
//           </div>
//           <div className="flex-1 rounded-xl overflow-hidden border border-signal-teal/40">
//             <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
//               <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
//               <Rectangle bounds={bounds} pathOptions={{ color: "#5eead4", weight: 1.5, fill: false }} />
//               {newStatusPoints.map((p, i) => (
//                 <CircleMarker key={i} center={[p.lat, p.lng]} radius={4}
//                   pathOptions={{
//                     color: p.is_corrected ? "#5eead4" : "#f87171",
//                     fillColor: p.is_corrected ? "#5eead4" : "#f87171",
//                     fillOpacity: 0.8,
//                   }} />
//               ))}
//               <FitToBounds bounds={bounds} />
//             </MapContainer>
//           </div>
//         </div>
//       </div>

//       <div className="px-6 pb-4 flex items-center gap-2 text-[12px] text-ink-400">
//         <Eye size={13} />
//         Real points sampled from the golden dataset, each classified using the actual
//         trained model's prediction - not placeholder or simulated numbers.
//       </div>
//     </div>
//   );
// }


import { API_BASE } from "../lib/apiBase";
import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Rectangle, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AlertCircle, CheckCircle2, Target, BarChart3, Eye, GripVertical } from "lucide-react";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "./ImageryOverlayLayer";

const DEM_API = `${API_BASE}/dem`;
const PREDICT_API = `${API_BASE}/predict`;

const markerIcon = new L.DivIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#5eead4;border:2px solid white;box-shadow:0 0 8px rgba(94,234,212,0.8);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function regionName(lat) {
  return lat >= 27.0 ? "Himalayan Foothill Region" : "Gangetic Plains Region";
}

function FitToBounds({ bounds }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
  }, [bounds, map]);
  return null;
}

// Same click-anywhere + sync pattern already proven in MapComparisonView -
// added here since Dashboard view was missing it (real bug found in testing)
function MapSyncAndClick({ onMapClick, partnerMapRef, thisMapRef }) {
  const map = useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    move() {
      if (partnerMapRef.current) {
        partnerMapRef.current.setView(map.getCenter(), map.getZoom(), { animate: false });
      }
    },
  });
  thisMapRef.current = map;
  return null;
}

async function fetchRealPlaceName(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const parts = [addr.county || addr.state_district, addr.state, addr.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

function DraggableResultCard({ children }) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragState = useRef(null);

  const onDragStart = (e) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
  };
  const onDragEnd = () => {
    dragState.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  };

  return (
    <div
      className="absolute z-[1000] bg-ink-900/95 backdrop-blur-md border border-ink-700/60 rounded-xl shadow-lg shadow-black/40 w-[340px]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div onMouseDown={onDragStart} className="flex items-center gap-2 px-3 py-2 border-b border-ink-700/60 cursor-grab select-none">
        <GripVertical size={14} className="text-ink-500" />
        <span className="text-[12px] font-medium text-ink-300">Point Details</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, valueColor, sublabel }) {
  return (
    <div className="flex-1 bg-ink-900/60 border border-ink-700/60 rounded-xl px-4 py-3 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={16} className={iconColor} />
      </div>
      <div>
        <p className="text-[12px] text-ink-400">{label}</p>
        <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">{sublabel}</p>
      </div>
    </div>
  );
}

export default function ErrorPointsDashboard({ year = 2022, cachedData, onDataLoaded }) {
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState(null);
  const [clickedPoint, setClickedPoint] = useState(null);
  const [pointResult, setPointResult] = useState(null);
  const [pointLoading, setPointLoading] = useState(false);
  const [placeName, setPlaceName] = useState(null);

  const leftMapRef = useRef(null);
  const rightMapRef = useRef(null);

  // Only fetches if not already cached by the parent page - fixes the
  // real re-computation-on-every-toggle bug found in testing
  useEffect(() => {
    if (cachedData) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${DEM_API}/error-points/${year}?sample_size=300`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((d) => {
        onDataLoaded(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [year, cachedData]);

  const handleMapClick = useCallback(
    (lat, lng) => {
      setClickedPoint({ lat, lng });
      setPointResult(null);
      setPlaceName(null);
      setPointLoading(true);

      fetch(`${PREDICT_API}/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, year }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setPointResult(data);
          setPointLoading(false);
        })
        .catch(() => {
          setPointResult({ error: "Could not fetch data for this point - it may be outside the study area." });
          setPointLoading(false);
        });

      fetchRealPlaceName(lat, lng).then(setPlaceName);
    },
    [year]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ink-400 text-sm">
        Computing real error points from the model - this samples real data and runs
        predictions, may take a moment...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-signal-red text-sm">
        Could not load error points: {error}
      </div>
    );
  }

  const { points, total_error_points, corrected_points, remaining_error_points, reduction_pct, avg_correction_m, threshold_m } = cachedData;

  const oldErrorPoints = points.filter((p) => p.was_error_point);

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const bounds = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto relative">
      <div className="flex gap-3 px-6 pt-4">
        <StatCard icon={AlertCircle} iconBg="bg-signal-red/15" iconColor="text-signal-red"
          label="Total Error Points (Old Map)" value={total_error_points}
          valueColor="text-signal-red" sublabel={`Points with error beyond ${threshold_m}m`} />
        <StatCard icon={CheckCircle2} iconBg="bg-signal-teal/15" iconColor="text-signal-teal"
          label="Corrected Points (New Map)" value={corrected_points}
          valueColor="text-signal-teal" sublabel="Successfully brought under threshold" />
        <StatCard icon={Target} iconBg="bg-signal-teal/15" iconColor="text-signal-teal"
          label="Reduction in Error Points" value={`${reduction_pct}%`}
          valueColor="text-signal-teal" sublabel={`${total_error_points} -> ${remaining_error_points} remaining`} />
        <StatCard icon={BarChart3} iconBg="bg-ink-700/40" iconColor="text-ink-300"
          label="Avg Elevation Error (Old -> New)" value={`${avg_correction_m}`}
          valueColor="text-white" sublabel="Mean correction applied" />
      </div>

      <div className="flex gap-4 px-6 py-4 flex-1 min-h-[400px]">
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-signal-red" />
            <span className="text-sm font-semibold text-white">Elevation Error (Old Method)</span>
            <span className="ml-auto text-[11px] text-signal-red">Error Points: {total_error_points}</span>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-ink-700/60">
            <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
              <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
              <Rectangle bounds={bounds} pathOptions={{ color: "#94a3b8", weight: 1.5, fill: false }} />
              {oldErrorPoints.map((p, i) => (
                <CircleMarker key={i} center={[p.lat, p.lng]} radius={4}
                  pathOptions={{ color: "#f87171", fillColor: "#f87171", fillOpacity: 0.8 }} />
              ))}
              {clickedPoint && <Marker position={[clickedPoint.lat, clickedPoint.lng]} icon={markerIcon} />}
              <FitToBounds bounds={bounds} />
              <MapSyncAndClick onMapClick={handleMapClick} partnerMapRef={rightMapRef} thisMapRef={leftMapRef} />
            </MapContainer>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-signal-teal" />
            <span className="text-sm font-semibold text-white">Elevation Error (Proposed Method)</span>
            <span className="ml-auto text-[11px] text-signal-teal">Remaining Error Points: {remaining_error_points}</span>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-signal-teal/40">
            <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
              <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
              <Rectangle bounds={bounds} pathOptions={{ color: "#5eead4", weight: 1.5, fill: false }} />
              {oldErrorPoints.map((p, i) => (
                <CircleMarker key={i} center={[p.lat, p.lng]} radius={4}
                  pathOptions={{
                    color: p.is_corrected ? "#5eead4" : "#f87171",
                    fillColor: p.is_corrected ? "#5eead4" : "#f87171",
                    fillOpacity: 0.8,
                  }} />
              ))}
              {clickedPoint && <Marker position={[clickedPoint.lat, clickedPoint.lng]} icon={markerIcon} />}
              <FitToBounds bounds={bounds} />
              <MapSyncAndClick onMapClick={handleMapClick} partnerMapRef={leftMapRef} thisMapRef={rightMapRef} />
            </MapContainer>
          </div>
        </div>
      </div>

      <div className="px-6 pb-4 flex items-center gap-2 text-[12px] text-ink-400">
        <Eye size={13} />
        Real points sampled from the golden dataset, each classified using the actual
        trained model's prediction. Click anywhere on either map for details on that spot.
      </div>

      {clickedPoint && (
        <DraggableResultCard>
          {pointLoading ? (
            <p className="text-[13px] text-ink-400">Fetching real values for this point...</p>
          ) : pointResult?.error ? (
            <p className="text-[13px] text-signal-amber">{pointResult.error}</p>
          ) : pointResult ? (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-ink-500">Real Location</p>
                <p className="text-sm font-medium text-white">{placeName || "Loading location..."}</p>
                <p className="text-[11px] text-ink-500 mt-0.5">{regionName(clickedPoint.lat)}</p>
                <p className="text-[11px] text-ink-500 font-mono mt-0.5">
                  {clickedPoint.lat.toFixed(4)}, {clickedPoint.lng.toFixed(4)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-700/60">
                <div>
                  <p className="text-[11px] text-ink-500">Raw Elevation</p>
                  <p className="text-base font-mono font-semibold text-ink-200">{pointResult.raw_elevation?.toFixed(2)} m</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Correction Applied</p>
                  <p className="text-base font-mono font-semibold text-signal-teal">
                    {pointResult.predicted_correction >= 0 ? "+" : ""}{pointResult.predicted_correction?.toFixed(2)} m
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Corrected Elevation</p>
                  <p className="text-base font-mono font-semibold text-white">{pointResult.corrected_elevation?.toFixed(2)} m</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">Uncertainty</p>
                  <p className={`text-base font-semibold ${
                    pointResult.risk_level === "Low" ? "text-signal-teal"
                    : pointResult.risk_level === "Medium" ? "text-signal-amber" : "text-signal-red"}`}>
                    {pointResult.risk_level}
                  </p>
                </div>
              </div>
              {!pointResult.is_reliable && (
                <p className="text-[11px] text-signal-amber pt-2 border-t border-ink-700/60">
                  Base models disagree on this point - treat with caution.
                </p>
              )}
            </div>
          ) : null}
        </DraggableResultCard>
      )}
    </div>
  );
}