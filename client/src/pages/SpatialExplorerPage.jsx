import { useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Rectangle, GeoJSON, Polyline, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import { Radar, Layers as LayersIcon, Grid3x3, Square, Home, Maximize, Ruler, Compass, Route } from "lucide-react";
import "leaflet/dist/leaflet.css";
import LayerStackPanel from "../components/spatial/LayerStackPanel";
import SpatialInspector from "../components/spatial/SpatialInspector";
import { datasets } from "../data/datasets";
import { buildGraticuleGeoJSON, AOI_PRESETS, boundsCenter } from "../lib/spatialMock";
import { sampleBands } from "../lib/mockSpatialSample";
import { fetchElevation } from "../lib/elevation";
// FIX: was duplicating this constant here instead of importing the
// single real source - now both pages share one definition, so the
// CARTO API key fix only needs to live in one place

import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../components/ImageryOverlayLayer";

const FOOTPRINT_DATASETS = [
  { datasetId: "sentinel2-l2a", color: "#60a5fa" },
  { datasetId: "sentinel1-grd", color: "#a78bfa" },
  { datasetId: "landsat8-c2", color: "#d9c48a" },
];

function parseBounds(bboxStr) {
  const [west, south, east, north] = bboxStr.split(",").map((s) => parseFloat(s.trim()));
  return [[south, west], [north, east]];
}

// ICESat-2 is photon/track data, not a raster tile — a filled rectangle
// footprint would misrepresent it. This instead generates a small set of
// near-vertical lines across the AOI, evoking ICESat-2's real near-polar
// reference ground track pattern (it flies ~1,387 repeating tracks
// globally). It's an illustrative pattern, not real ATL03 photon
// geolocation — that requires an authenticated NASA Earthdata/CMR query,
// which isn't feasible client-side without a backend to hold credentials.
function buildIcesatTracks(bounds, count = 5) {
  const [[south, west], [north, east]] = bounds;
  const lonSpan = east - west;
  const latPad = (north - south) * 0.15;
  const tracks = [];
  for (let i = 0; i < count; i++) {
    const baseLon = west + (lonSpan * (i + 0.5)) / count;
    const jitter = Math.sin(i * 2.4) * lonSpan * 0.04;
    tracks.push([
      [south - latPad, baseLon - jitter],
      [(south + north) / 2, baseLon],
      [north + latPad, baseLon + jitter],
    ]);
  }
  return tracks;
}

function ClickSampler({ onSample }) {
  useMapEvents({
    click(e) {
      onSample(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SpatialExplorerPage({ satellites }) {
  const graticule = useMemo(() => buildGraticuleGeoJSON(20), []);
  const [aoiIndex, setAoiIndex] = useState(0);
  const aoi = AOI_PRESETS[aoiIndex];
  const [sample, setSample] = useState(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const mapContainerRef = useRef(null);

  const footprintLayers = FOOTPRINT_DATASETS.map((f) => ({
    ...f,
    dataset: datasets.find((d) => d.id === f.datasetId),
  })).filter((f) => f.dataset);

  const icesatTracks = useMemo(() => buildIcesatTracks(aoi.bounds), [aoi]);

  const [layers, setLayers] = useState(() => [
    {
      id: "satellite-tracks",
      name: "Live Satellite Tracks",
      subtitle: "Real SGP4-propagated positions",
      meta: "Source: CelesTrak TLE · same feed as Dashboard",
      icon: Radar,
      color: "#5eead4",
      visible: true,
      hasOpacity: true,
      opacity: 0.9,
    },
    {
      id: "icesat2-tracks",
      name: "ICESat-2 Photon Track",
      subtitle: "Illustrative ground-track pattern (not real photon data)",
      meta: "Real ATL03 access needs NASA Earthdata auth",
      icon: Route,
      color: "#a3e635",
      visible: true,
      hasOpacity: true,
      opacity: 0.8,
    },
    ...footprintLayers.map((f) => ({
      id: `footprint-${f.datasetId}`,
      name: f.dataset.name,
      subtitle: `${f.dataset.type} footprint (mock coverage)`,
      meta: f.dataset.crs,
      icon: LayersIcon,
      color: f.color,
      visible: f.datasetId === "sentinel2-l2a",
      hasOpacity: true,
      opacity: 0.18,
    })),
    {
      id: "aoi",
      name: aoi.name,
      subtitle: `${aoi.label} (mock)`,
      meta: "Polygon bounding area",
      icon: Square,
      color: "#4ade80",
      visible: true,
      hasOpacity: true,
      opacity: 0.12,
    },
    {
      id: "graticule",
      name: "Coordinate Grid",
      subtitle: "20° lat/lon reference lines",
      meta: null,
      icon: Grid3x3,
      color: "#6b7688",
      visible: false,
      hasOpacity: false,
      opacity: 1,
    },
  ]);

  const toggleLayer = (id) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  const setOpacity = (id, opacity) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, opacity } : l)));

  const cycleAoi = () => {
    const next = (aoiIndex + 1) % AOI_PRESETS.length;
    setAoiIndex(next);
    setLayers((prev) =>
      prev.map((l) =>
        l.id === "aoi"
          ? { ...l, name: AOI_PRESETS[next].name, subtitle: `${AOI_PRESETS[next].label} (mock)` }
          : l
      )
    );
  };

  const layerOn = (id) => layers.find((l) => l.id === id)?.visible;
  const layerOpacity = (id) => layers.find((l) => l.id === id)?.opacity ?? 1;

  const handleSample = (lat, lon) => {
    const startedAt = performance.now();
    const bands = sampleBands(lat, lon);
    setSample({ lat, lon, bands, elevationM: null, elevationStatus: "loading", processingTimeMs: null });
    setInspectorCollapsed(false);

    // Real elevation lookup — Open-Meteo's Elevation API, backed by the
    // Copernicus DEM. Guard against a slower/stale request landing after a
    // newer click by checking the coords still match before applying it.
    fetchElevation(lat, lon)
      .then((elevationM) => {
        setSample((prev) =>
          prev && prev.lat === lat && prev.lon === lon
            ? { ...prev, elevationM, elevationStatus: "ok", processingTimeMs: Math.round(performance.now() - startedAt) }
            : prev
        );
      })
      .catch(() => {
        setSample((prev) =>
          prev && prev.lat === lat && prev.lon === lon
            ? { ...prev, elevationStatus: "error", processingTimeMs: Math.round(performance.now() - startedAt) }
            : prev
        );
      });
  };

  const center = boundsCenter(aoi.bounds);

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 px-5 h-auto min-h-[56px] py-2 border-b border-ink-700/60 shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.15em] text-ink-400 uppercase shrink-0">
          <Compass size={14} className="text-signal-teal" />
          GEOINT / Spatial Explorer
        </div>
        <span className="inline-flex items-center gap-1.5 bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[11px] text-ink-200">
          AOI: {aoi.name} · {aoi.bounds[0][0].toFixed(2)}°, {aoi.bounds[0][1].toFixed(2)}°
        </span>
        <span className="inline-flex items-center gap-1.5 bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[11px] text-ink-400 font-mono">
          EPSG:4326
        </span>
        <span className="hidden md:inline-flex items-center gap-1.5 bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5 text-[11px] text-ink-400 font-mono">
          Live satellites: {satellites?.filter((s) => s.position).length ?? 0}
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* layer stack */}
        <div className="hidden md:block w-72 shrink-0 border-r border-ink-700/60 px-3 py-3">
          <LayerStackPanel layers={layers} onToggle={toggleLayer} onOpacity={setOpacity} onNewAoi={cycleAoi} />
        </div>

        {/* map */}
        <div ref={mapContainerRef} className="relative flex-1 min-w-0 isolate">
          <MapContainer
            center={center}
            zoom={5}
            minZoom={2}
            worldCopyJump
            zoomControl={false}
            attributionControl={false}
            style={{ width: "100%", height: "100%", background: "#08090b" }}
          >
            <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
            <ClickSampler onSample={handleSample} />

            {layerOn("graticule") && (
              <GeoJSON
                key="graticule"
                data={graticule}
                style={{ color: "#6b7688", weight: 0.6, opacity: 0.5, dashArray: "1 4" }}
              />
            )}

            {footprintLayers.map(
              (f) =>
                layerOn(`footprint-${f.datasetId}`) && (
                  <Rectangle
                    key={f.datasetId}
                    bounds={parseBounds(f.dataset.boundingBox)}
                    pathOptions={{
                      color: f.color,
                      weight: 1,
                      fillColor: f.color,
                      fillOpacity: layerOpacity(`footprint-${f.datasetId}`),
                    }}
                  >
                    <Tooltip sticky>{f.dataset.name}</Tooltip>
                  </Rectangle>
                )
            )}

            {layerOn("icesat2-tracks") &&
              icesatTracks.map((track, i) => (
                <Polyline
                  key={`icesat2-${i}`}
                  positions={track}
                  pathOptions={{
                    color: "#a3e635",
                    weight: 1.3,
                    opacity: layerOpacity("icesat2-tracks"),
                  }}
                >
                  <Tooltip sticky>ICESat-2 reference ground track (illustrative)</Tooltip>
                </Polyline>
              ))}

            {layerOn("aoi") && (
              <Rectangle
                bounds={aoi.bounds}
                pathOptions={{ color: "#4ade80", weight: 2, fillColor: "#4ade80", fillOpacity: layerOpacity("aoi") }}
              >
                <Tooltip sticky>
                  {aoi.name} — {aoi.label}
                </Tooltip>
              </Rectangle>
            )}

            {layerOn("satellite-tracks") &&
              (satellites ?? []).map((sat) =>
                sat.track.map((segment, i) => (
                  <Polyline
                    key={`${sat.id}-${i}`}
                    positions={segment.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{
                      color: sat.color,
                      weight: 1,
                      opacity: layerOpacity("satellite-tracks") * 0.55,
                      dashArray: "2 6",
                    }}
                  />
                ))
              )}

            {layerOn("satellite-tracks") &&
              (satellites ?? [])
                .filter((s) => s.position)
                .map((sat) => (
                  <CircleMarker
                    key={sat.id}
                    center={[sat.position.lat, sat.position.lon]}
                    radius={4}
                    pathOptions={{
                      color: sat.color,
                      weight: 1.5,
                      fillColor: "#0c0e12",
                      fillOpacity: 1,
                      opacity: layerOpacity("satellite-tracks"),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -4]}>
                      {sat.short} · {sat.position.altKm.toFixed(0)} km
                    </Tooltip>
                  </CircleMarker>
                ))}
          </MapContainer>

          {/* map controls */}
          <div className="absolute top-4 right-4 z-[900] flex flex-col gap-1.5">
            {[
              { icon: Home, title: "Reset view" },
              { icon: Maximize, title: "Fullscreen" },
              { icon: Ruler, title: "Measure (coming soon)" },
            ].map((c, i) => (
              <button
                key={i}
                title={c.title}
                className="w-8 h-8 flex items-center justify-center bg-ink-900/90 border border-ink-700/70 rounded-lg text-ink-300 hover:text-white shadow-panel"
              >
                <c.icon size={14} />
              </button>
            ))}
          </div>

          <SpatialInspector
            sample={sample}
            collapsed={inspectorCollapsed}
            onToggleCollapse={() => setInspectorCollapsed((c) => !c)}
            containerRef={mapContainerRef}
          />
        </div>
      </div>
    </div>
  );
}