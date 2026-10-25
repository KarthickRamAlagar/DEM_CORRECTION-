import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";
import MapFurniture from "./MapFurniture";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../ImageryOverlayLayer";
import { fetchSdgGeojson, fetchSdgMap, fmtInt, fmtCompact, fmtMoney, NO_DATA } from "../../lib/sdgApi";

const RAMP = ["#ccfbf1", "#5eead4", "#14b8a6", "#0f766e", "#134e4a"];
const METRICS = {
  people: { field: "pop_exposed", label: "People exposed", fmt: fmtCompact },
  cropland: { field: "cropland_ha_exposed", label: "Cropland flooded (ha)", fmt: fmtInt },
  need: { field: "need_max_inr", label: "Recovery need, max (INR)", fmt: (v) => fmtMoney(v, "INR") },
};

// District map of the selected SDG numbers. Grey = no data (district not covered well enough by satellite).
export default function DistrictMap({ metric, year, bound, coveredOnly, country }) {
  const geo = useQuery({ queryKey: ["sdg-geojson"], queryFn: fetchSdgGeojson, staleTime: Infinity });
  const map = useQuery({ queryKey: ["sdg-map", year, bound, coveredOnly], queryFn: () => fetchSdgMap({ year, bound, covered_only: coveredOnly }) });
  const m = METRICS[metric];
  if (geo.isError || map.isError) return <div className="text-[13px] text-signal-amber">The district map could not be loaded.</div>;
  if (!geo.data || !map.data) return <div className="text-[13px] text-ink-400">Loading map...</div>;

  const rows = Object.fromEntries(map.data.rows.filter((r) => r.iso === country).map((r) => [r.did, r]));
  const values = Object.values(rows).map((r) => r[m.field]).filter((v) => v != null);
  const max = Math.max(1, ...values);
  const colour = (v) => (v == null ? "#6b7280" : RAMP[Math.min(4, Math.floor(Math.sqrt(v / max) * 5))]);
  const features = { ...geo.data, features: geo.data.features.filter((f) => f.properties.iso === country) };

  return (
    <div className="rounded-xl overflow-hidden border border-ink-700/70">
      <div style={{ height: 360 }}>
        <MapContainer bounds={country === "IND" ? [[25.0, 80.3], [28.2, 86.8]] : [[26.3, 80.3], [29.0, 86.8]]} style={{ height: "100%", width: "100%" }}>
          <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />
          <MapFurniture />
          <GeoJSON
            key={`${country}-${metric}-${year}-${bound}-${coveredOnly}`}
            data={features}
            style={(f) => ({ color: "#0f172a", weight: 0.6, fillOpacity: 0.78, fillColor: colour(rows[f.properties.did]?.[m.field] ?? null) })}
            onEachFeature={(f, layer) => {
              const r = rows[f.properties.did];
              const v = r?.[m.field];
              layer.bindTooltip(`${f.properties.name}: ${v == null ? NO_DATA : m.fmt(v)}`, { sticky: true });
            }}
          />
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-ink-700/60 bg-ink-900/60 px-3 py-2 text-[12px] text-ink-300">
        <span className="font-medium text-ink-100">{m.label}</span>
        <span className="flex items-center gap-1">{RAMP.map((c) => <span key={c} className="inline-block h-2.5 w-5" style={{ background: c }} />)} low to high (max {m.fmt(max)})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5" style={{ background: "#6b7280" }} /> No data</span>
      </div>
    </div>
  );
}
