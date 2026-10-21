import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, ImageOverlay, Rectangle, Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../ImageryOverlayLayer";
import { fetchRegionMaps, fmtInt, fmtPct, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented, DataTable } from "./Ui";

const BOX = [[25.4, 81.9], [28.0, 84.0]];
const COUNTRIES = [{ id: "NPL", label: "Nepal" }, { id: "IND", label: "India" }, { id: "ALL", label: "Both" }];
const VIEWS = [{ id: "side", label: "Side by side" }, { id: "diff", label: "Where they differ" }];
const NAME = { NPL: "Nepal", IND: "India" };

// keeps two maps on the same centre and zoom
function ViewSync({ id, view, setView }) {
  const map = useMap();
  useMapEvents({ move: () => { const c = map.getCenter(); setView({ id, lat: c.lat, lng: c.lng, zoom: map.getZoom() }); } });
  useEffect(() => {
    if (!view || view.id === id) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - view.lat) > 1e-9 || Math.abs(c.lng - view.lng) > 1e-9 || map.getZoom() !== view.zoom) map.setView([view.lat, view.lng], view.zoom, { animate: false });
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FloodMap({ id, title, image, bounds, view, setView, point, radiusKm, height }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-[14px] font-medium text-white">{title}</figcaption>
      <div className="overflow-hidden rounded-xl border border-ink-700/60" style={{ height }}>
        <MapContainer bounds={BOX} boundsOptions={{ padding: [6, 6] }} zoomSnap={0.25} zoomDelta={0.5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
          <Rectangle bounds={BOX} pathOptions={{ color: "#5eead4", weight: 1, fill: false, dashArray: "6 6" }} />
          <ImageOverlay url={`data:image/png;base64,${image}`} bounds={bounds} opacity={0.95} />
          {point && <Circle center={[point.lat, point.lng]} radius={(radiusKm ?? 10) * 1000} pathOptions={{ color: "#facc15", weight: 2, fill: false }} />}
          {point && <CircleMarker center={[point.lat, point.lng]} radius={4} pathOptions={{ color: "#facc15", fillColor: "#facc15", fillOpacity: 1 }} />}
          <ViewSync id={id} view={view} setView={setView} />
        </MapContainer>
      </div>
    </figure>
  );
}

const Swatch = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: color }} />{children}</span>
);

export default function RegionFloodMaps({ point, radiusKm, defaultRise = 2, defaultCountry = "NPL" }) {
  const [country, setCountry] = useState(defaultCountry);
  const [rise, setRise] = useState(defaultRise);
  const [mode, setMode] = useState("side");
  const [view, setView] = useState(null);
  const q = useQuery({ queryKey: ["sdg-region", rise, country], queryFn: () => fetchRegionMaps({ rise_m: rise, country }), retry: 0, placeholderData: (p) => p });
  const d = q.data;
  const rows = (d?.stats ?? []).filter((s) => country === "ALL" || s.iso === country);
  const pctDiff = (a, b) => (a ? `${(((b - a) / a) * 100).toFixed(0)}%` : NO_DATA);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Segmented label="Country" options={COUNTRIES} value={country} onChange={setCountry} />
        <Segmented label="Map view" options={VIEWS} value={mode} onChange={setMode} />
        <label className="flex items-center gap-2 text-[13.5px] text-ink-200">
          River rises by
          <select value={rise} onChange={(e) => setRise(Number(e.target.value))} className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[13.5px] text-white">
            {(d?.rises ?? [0.5, 1, 2, 3, 4, 6, 8, 10]).map((r) => <option key={r} value={r}>{r} m</option>)}
          </select>
        </label>
      </div>

      {q.isError && <div className="mt-4"><Banner tone="amber">{q.error.message}</Banner></div>}
      {!d && q.isLoading && <p className="mt-4 text-[13.5px] text-ink-300">Loading the regional maps...</p>}

      {d && (
        <>
          {mode === "side" ? (
            <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <FloodMap id="raw" title="Raw DEM (before correction)" image={d.images.raw} bounds={d.bounds} view={view} setView={setView} point={point} radiusKm={radiusKm} height={420} />
              <FloodMap id="cor" title="Corrected DEM (after correction)" image={d.images.corrected} bounds={d.bounds} view={view} setView={setView} point={point} radiusKm={radiusKm} height={420} />
            </div>
          ) : (
            <div className="mt-4">
              <FloodMap id="diff" title="Where the two flood maps differ" image={d.images.difference} bounds={d.bounds} view={view} setView={setView} point={point} radiusKm={radiusKm} height={460} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-200">
            <Swatch color="#2563eb">Under water{mode === "diff" ? " in both" : ""}</Swatch>
            {mode === "diff" && <Swatch color="#8b5cf6">Only with the corrected DEM</Swatch>}
            {mode === "diff" && <Swatch color="#f59e0b">Only with the raw DEM</Swatch>}
            <span className="text-ink-300">Dashed box: area with river-height data. Both maps move together.</span>
          </div>

          <div className="mt-5">
            <DataTable
              caption="Flooded area and people exposed, raw and corrected DEM"
              rows={rows}
              rowKey={(r) => r.iso}
              columns={[
                { key: "c", label: "Country", render: (r) => NAME[r.iso] },
                { key: "ar", label: "Under water, raw", align: "right", render: (r) => `${fmtInt(r.raw.km2)} km²` },
                { key: "ac", label: "Under water, corrected", align: "right", render: (r) => `${fmtInt(r.corrected.km2)} km² (${pctDiff(r.raw.km2, r.corrected.km2)})` },
                { key: "mv", label: "Area that changes", align: "right", render: (r) => `${fmtInt(r.moved_km2)} km²` },
                { key: "pr", label: "People, raw", align: "right", render: (r) => fmtInt(r.raw.people) },
                { key: "pc", label: "People, corrected", align: "right", render: (r) => `${fmtInt(r.corrected.people)} (${pctDiff(r.raw.people, r.corrected.people)})` },
              ]}
            />
          </div>
          <div className="mt-3 space-y-1 text-[13px] leading-relaxed text-ink-300 max-w-3xl">
            <p>{d.label}</p>
            {d.notes.map((n) => <p key={n}>{n}</p>)}
            <p>People exposed use the 2020 WorldPop estimate. Exposure is not casualties or damage.</p>
          </div>
        </>
      )}
    </div>
  );
}
