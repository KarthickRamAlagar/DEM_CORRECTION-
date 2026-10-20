import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { AlertTriangle, ExternalLink } from "lucide-react";
import "leaflet/dist/leaflet.css";
import ImageryOverlayLayer, { imageryStatus, DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "./ImageryOverlayLayer";
import { sentinelHubCapabilitiesUrl } from "../lib/imagery";
import { getSettings } from "../lib/settingsStore";

function RecenterOnSelect({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lon != null) {
      const zoom = Math.max(map.getZoom(), 3);
      if (getSettings().animationsEnabled) map.flyTo([lat, lon], zoom, { duration: 0.8 });
      else map.setView([lat, lon], zoom, { animate: false }); // Animations off: jump, don't fly
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);
  return null;
}

// Leaflet measures its container's pixel size synchronously the moment it
// mounts. Since this whole map only mounts when the "Imagery" tab becomes
// active (see MapPane.jsx), that can occasionally race the browser's layout
// pass and leave Leaflet with a stale/zero size — tiles then render
// misaligned or only fill part of the panel. Re-measuring on mount (and on
// window resize) fixes that without touching how/when the tab mounts.
function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const raf = requestAnimationFrame(fix); // catch layout that settles a frame late
    window.addEventListener("resize", fix);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

export default function ImageryMap({ satellites, selectedId, onSelect }) {
  const selected = satellites.find((s) => s.id === selectedId);
  const { config, needsInstanceId, instanceId } = imageryStatus(selectedId);

  return (
    <div className="relative isolate w-full h-full bg-ink-950">
      <MapContainer
        center={[selected?.position?.lat ?? 20, selected?.position?.lon ?? 0]}
        zoom={3}
        minZoom={2}
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%", background: "#08090b" }}
      >
        <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
        <InvalidateSizeOnMount />
        <ImageryOverlayLayer satId={selectedId} />
        {selected?.position && <RecenterOnSelect lat={selected.position.lat} lon={selected.position.lon} />}

        {satellites.map((sat) =>
          sat.track.map((segment, i) => (
            <Polyline
              key={`${sat.id}-track-${i}`}
              positions={segment.map(([lon, lat]) => [lat, lon])}
              pathOptions={{
                color: sat.color,
                weight: sat.id === selectedId ? 2 : 1,
                opacity: sat.id === selectedId ? 0.85 : 0.3,
                dashArray: "2 6",
              }}
            />
          ))
        )}

        {satellites
          .filter((s) => s.position)
          .map((sat) => (
            <CircleMarker
              key={sat.id}
              center={[sat.position.lat, sat.position.lon]}
              radius={sat.id === selectedId ? 7 : 5}
              pathOptions={{
                color: sat.color,
                weight: sat.id === selectedId ? 2.5 : 1.5,
                fillColor: "#0c0e12",
                fillOpacity: 1,
                opacity: sat.id === selectedId ? 1 : 0.55,
              }}
              eventHandlers={{ click: () => onSelect(sat.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1} permanent={sat.id === selectedId}>
                {sat.short}
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="absolute top-16 left-4 z-[1000] max-w-xs pointer-events-none">
        {config && !needsInstanceId && (
          <div className="bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-lg px-3 py-2 text-[11px] text-ink-200 shadow-panel pointer-events-auto">
            <div>{config.label}</div>
            {config.type === "sentinelhub-wms" && (
              <a
                href={sentinelHubCapabilitiesUrl(instanceId)}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-signal-teal hover:underline"
              >
                Blank tiles? View available layers on this instance
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
        {needsInstanceId && (
          <div className="flex items-start gap-2 bg-ink-900/90 backdrop-blur border border-signal-amber/40 rounded-lg px-3 py-2 text-[11px] text-ink-200 shadow-panel pointer-events-auto">
            <AlertTriangle size={14} className="text-signal-amber shrink-0 mt-0.5" />
            <span>
              Set <code className="text-signal-amber">VITE_SENTINELHUB_INSTANCE_ID</code> (or a
              per-satellite override) in your <code className="text-signal-amber">.env</code> to enable this
              layer — see <code className="text-signal-amber">.env.example</code>.
            </span>
          </div>
        )}
        {!config && (
          <div className="bg-ink-900/90 backdrop-blur border border-ink-700/70 rounded-lg px-3 py-2 text-[11px] text-ink-400 shadow-panel">
            No near-real-time imagery source configured for {selected?.short ?? "this satellite"}.
          </div>
        )}
      </div>
    </div>
  );
}
