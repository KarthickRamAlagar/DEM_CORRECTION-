import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, ImageOverlay, Rectangle, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../ImageryOverlayLayer";

const LAYER_BOX = [[25.4, 81.9], [28.0, 84.0]];   // river-height layer coverage

function Recenter({ point, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.fitBounds(L_bounds(point, radiusKm * 1.6));
  }, [point?.lat, point?.lng, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function L_bounds(p, km) {
  const dlat = km / 111.195, dlon = km / (111.195 * Math.cos((p.lat * Math.PI) / 180));
  return [[p.lat - dlat, p.lng - dlon], [p.lat + dlat, p.lng + dlon]];
}
function Picker({ onPick }) {
  useMapEvents({ click: (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function PlaceMap({ point, radiusKm, overlay, onPick }) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-ink-700/70" style={{ height: 380 }}>
      <MapContainer bounds={LAYER_BOX} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
        <Rectangle bounds={LAYER_BOX} pathOptions={{ color: "#5eead4", weight: 1.5, fill: false, dashArray: "6 6" }} />
        {overlay && <ImageOverlay url={`data:image/png;base64,${overlay.png}`} bounds={overlay.bounds} opacity={0.9} />}
        {point && <Circle center={[point.lat, point.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#facc15", weight: 2, fill: false }} />}
        {point && <CircleMarker center={[point.lat, point.lng]} radius={5} pathOptions={{ color: "#facc15", fillColor: "#facc15", fillOpacity: 1 }} />}
        {point && <Recenter point={point} radiusKm={radiusKm} />}
        <Picker onPick={onPick} />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] rounded-md bg-ink-950/85 border border-ink-700/60 px-2.5 py-1.5 text-[10.5px] text-ink-200 space-y-0.5">
        <div><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "#2563eb" }} />Flooded in both DEM scenarios</div>
        <div><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "#8b5cf6" }} />Flooded only with the corrected DEM</div>
        <div><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: "#f59e0b" }} />Flooded only with the raw DEM</div>
        <div className="text-ink-400">Dashed box: area where river-height data exists. Click the map to move the place.</div>
      </div>
    </div>
  );
}
