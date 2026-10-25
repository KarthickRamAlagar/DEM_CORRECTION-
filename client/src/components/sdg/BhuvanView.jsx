import { useState } from "react";
import { MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker, Rectangle, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../ImageryOverlayLayer";
import { BHUVAN_WMS, BHUVAN_LAYERS, legendUrl } from "../../lib/bhuvanLayers";
import { Banner } from "./Ui";

const LAYER_BOX = [[25.4, 81.9], [28.0, 84.0]];
const START_BOUNDS = [[24.3, 81.0], [28.3, 87.0]];   // our region plus the Bihar layer extent

function Picker({ onPick }) {
  useMapEvents({ click: (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// Bhuvan shown inside our own map as a WMS layer (the Bhuvan website itself refuses to be embedded in another site).
export default function BhuvanView({ point, radiusKm, onPick }) {
  const [id, setId] = useState(BHUVAN_LAYERS[0].id);
  const [on, setOn] = useState(true);
  const [opacity, setOpacity] = useState(0.75);
  const [errors, setErrors] = useState(0);
  const [legendOk, setLegendOk] = useState(true);
  const L = BHUVAN_LAYERS.find((x) => x.id === id);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px] text-ink-300">
        <select value={id} onChange={(e) => { setId(e.target.value); setErrors(0); setLegendOk(true); }}
          className="rounded-lg border border-ink-700/70 bg-ink-900/60 px-2.5 py-1.5 text-[13px] text-ink-100 max-w-full">
          {BHUVAN_LAYERS.map((x) => <option key={x.id} value={x.id}>{x.label}{x.tested ? "" : " (not yet tested)"}</option>)}
        </select>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Show layer</label>
        <label className="flex items-center gap-1.5">Opacity
          <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-ink-700/70" style={{ height: 380 }}>
        <MapContainer bounds={point ? undefined : START_BOUNDS} center={point ? [point.lat, point.lng] : undefined} zoom={point ? 9 : undefined} style={{ height: "100%", width: "100%" }}>
          <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
          {on && (
            <WMSTileLayer key={L.id} url={BHUVAN_WMS} layers={L.layer} version="1.1.1" format="image/png" transparent opacity={opacity}
              attribution="Layer: ISRO Bhuvan (NRSC)" eventHandlers={{ tileerror: () => setErrors((n) => n + 1) }} />
          )}
          <Rectangle bounds={LAYER_BOX} pathOptions={{ color: "#5eead4", weight: 1.5, fill: false, dashArray: "6 6" }} />
          {point && <Circle center={[point.lat, point.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#facc15", weight: 2, fill: false }} />}
          {point && <CircleMarker center={[point.lat, point.lng]} radius={5} pathOptions={{ color: "#facc15", fillColor: "#facc15", fillOpacity: 1 }} />}
          <Picker onPick={onPick} />
        </MapContainer>
        {on && legendOk && (
          <div className="absolute bottom-2 left-2 z-[1000] max-w-[45%] max-h-[60%] overflow-auto rounded-md bg-ink-950/90 border border-ink-700/60 p-1.5">
            <img src={legendUrl(L.layer)} alt="Bhuvan legend" onError={() => setLegendOk(false)} className="max-w-full" />
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {errors >= 3 && <Banner tone="amber">Bhuvan did not return map tiles for this layer here. The layer may not cover this area, or the service is slow or down. The rest of the app is not affected.</Banner>}
        <p className="text-[12px] text-ink-400">
          Context layer from ISRO Bhuvan. India only: no Bhuvan layers cover Nepal. It shows land cover, not flood extent or our corrected DEM.
          {L.tested ? " This layer returned a real map image in a test on 21 Oct 2026." : " This layer has not been tested yet and may show nothing."}
          {" "}Bhuvan's terms of use were not stated on the page checked; confirm them before public release.
        </p>
      </div>
    </div>
  );
}
