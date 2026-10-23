import { API_BASE } from "../lib/apiBase";
import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Rectangle, useMapEvents, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { GripVertical } from "lucide-react";
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
    if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
  }, [bounds, map]);
  return null;
}

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

/** Draggable card - matches the app's own Live Telemetry panel style:
 * a GripVertical icon + label as the drag handle, not a plain bar. */
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
      className="absolute z-[1000] bg-ink-900/95 backdrop-blur-md border border-ink-700/60 rounded-xl shadow-lg shadow-black/40 w-[360px]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2 px-3 py-2 border-b border-ink-700/60 cursor-grab select-none"
      >
        <GripVertical size={14} className="text-ink-500" />
        <span className="text-[12px] font-medium text-signal-green">Point Details</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function MapComparisonView({ year = 2022 }) {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clickedPoint, setClickedPoint] = useState(null);
  const [pointResult, setPointResult] = useState(null);
  const [pointLoading, setPointLoading] = useState(false);
  const [placeName, setPlaceName] = useState(null);

  const leftMapRef = useRef(null);
  const rightMapRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setClickedPoint(null);
    setPointResult(null);
    fetch(`${DEM_API}/comparison/${year}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setComparison(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [year]);

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
        Loading DEM comparison...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-signal-red text-sm text-center px-8">
        Could not load comparison: {error}
      </div>
    );
  }

  const { bounds } = comparison;
  const rectBounds = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];

  return (
    <div className="flex h-full w-full relative">
      <div className="flex-1 relative border-r border-ink-700/60">
        <div className="absolute top-3 left-3 z-[1000] bg-ink-900/90 backdrop-blur-md border border-ink-700/60 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white">
          Raw (Uncorrected) CartoDEM - Study Area
        </div>
        <MapContainer bounds={rectBounds}    zoomControl={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
          {/* Boundary outline only - real basemap stays fully visible underneath */}
          <Rectangle bounds={rectBounds} pathOptions={{ color: "#94a3b8", weight: 2, fill: false }} />
          {clickedPoint && <Marker position={[clickedPoint.lat, clickedPoint.lng]} icon={markerIcon} />}
          <FitToBounds bounds={rectBounds} />
          <MapSyncAndClick onMapClick={handleMapClick} partnerMapRef={rightMapRef} thisMapRef={leftMapRef} />
        </MapContainer>
      </div>

      <div className="flex-1 relative">
        <div className="absolute top-3 left-3 z-[1000] bg-ink-900/90 backdrop-blur-md border border-signal-teal/40 rounded-lg px-3 py-1.5 text-[12px] font-medium text-signal-teal">
          ML-Corrected DEM - Study Area
        </div>
        <MapContainer bounds={rectBounds}   zoomControl={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
          <Rectangle bounds={rectBounds} pathOptions={{ color: "#5eead4", weight: 2, fill: false }} />
          {clickedPoint && <Marker position={[clickedPoint.lat, clickedPoint.lng]} icon={markerIcon} />}
          <FitToBounds bounds={rectBounds} />
          <MapSyncAndClick onMapClick={handleMapClick} partnerMapRef={leftMapRef} thisMapRef={rightMapRef} />
        </MapContainer>
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
                <p className="text-[11px] text-pink-400">Real Location</p>
                <p className="text-sm font-medium text-white">
                  {placeName || "Loading location..."}
                </p>
                <p className="text-[11px] text-orange-500 mt-0.5">{regionName(clickedPoint.lat)}</p>
                <p className="text-[11px] text-orange-500 font-mono mt-0.5">
                  {clickedPoint.lat.toFixed(4)}, {clickedPoint.lng.toFixed(4)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-700/60">
                <div>
                  <p className="text-[11px] text-yellow-500">Raw Elevation</p>
                  <p className="text-base font-mono font-semibold text-ink-200">
                    {pointResult.raw_elevation?.toFixed(2)} m
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-yellow-500">Correction Applied</p>
                  <p className="text-base font-mono font-semibold text-signal-teal">
                    {pointResult.predicted_correction >= 0 ? "+" : ""}
                    {pointResult.predicted_correction?.toFixed(2)} m
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-yellow-500">Corrected Elevation</p>
                  <p className="text-base font-mono font-semibold text-white">
                    {pointResult.corrected_elevation?.toFixed(2)} m
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-yellow-500">Uncertainty</p>
                  <p
                    className={`text-base font-semibold ${
                      pointResult.risk_level === "Low"
                        ? "text-signal-teal"
                        : pointResult.risk_level === "Medium"
                        ? "text-signal-amber"
                        : "text-signal-red"
                    }`}
                  >
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

      {!clickedPoint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-ink-900/90 backdrop-blur-md border border-ink-700/60 rounded-lg px-4 py-2 text-[12px] text-ink-400">
          Click anywhere inside the boundary to see real values for that location
        </div>
      )}
    </div>
  );
}