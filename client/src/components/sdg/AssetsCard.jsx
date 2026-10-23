import { useQuery } from "@tanstack/react-query";
import { fetchAssets } from "../../lib/assetsApi";
import { fmtInt, NO_DATA } from "../../lib/sdgApi";
import { Banner, Figures } from "./Ui";

// Patch 22 (D2, D3): main roads, bridges, schools, health facilities and shelters in the flooded part of the circle.
// Data: OpenStreetMap through etl/sdg/osm_assets.py and /api/sdg/chain/assets. A what-if from terrain height. Counts are minimums.
const km = (v) => (v == null ? NO_DATA : `${v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(1)} km`);
const CLASS = { motorway: "motorway", trunk: "trunk road", primary: "primary road", secondary: "secondary road", tertiary: "tertiary road" };
const KIND = { school: "School", health: "Health facility", shelter: "Shelter" };

const share = (a, b) => (b ? `${a} of ${b}` : "none mapped");

export default function AssetsCard({ point, radius, rise }) {
  const q = useQuery({
    queryKey: ["assets", point?.lat, point?.lng, radius, rise],
    queryFn: () => fetchAssets({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: rise }),
    enabled: !!point, retry: 0,
  });
  if (q.isError) return <div className="mt-3"><Banner tone="amber">Roads and facilities: {q.error.message}</Banner></div>;
  if (!q.data) return <p className="mt-3 text-[13.5px] text-ink-300">Counting roads, bridges, schools and health facilities...</p>;
  const d = q.data;
  if (!d.available) return <div className="mt-3"><Banner tone="amber">{d.message}</Banner></div>;
  const c = d.scenario.corrected, r = d.scenario.raw;
  const roadsC = c.roads, roadsR = r.roads;
  const cov = roadsC && roadsC.km_total > 0 ? roadsC.km_with_river_height / roadsC.km_total : null;
  const listed = d.under_water_list.filter((x) => x.name).slice(0, 8);

  return (
    <div>
      <div className="mt-2"><Banner tone="amber">
        <strong>Counts are minimums.</strong> OpenStreetMap is mapped by volunteers and misses many small schools, clinics and village roads. Only main roads were downloaded. This is a what-if from terrain height at a {rise} m river rise, not a forecast and not a damage assessment.
      </Banner></div>
      {d.coverage?.schools_thin && (
        <div className="mt-3"><Banner tone="amber">
          <strong>School mapping looks thin here.</strong> OpenStreetMap lists {d.coverage.schools_mapped} school{d.coverage.schools_mapped === 1 ? "" : "s"} but {d.coverage.health_mapped} health facilities inside this circle. Indian schools are mapped far less completely than Nepali ones, so the school count is a very low minimum and cannot be compared with other places.
        </Banner></div>
      )}
      <div className="mt-4">
        <Figures items={[
          { label: "Main road under water", value: km(roadsC?.km_under_water), noData: !roadsC, sub: roadsC ? `of ${km(roadsC.km_total)} mapped in the circle. Raw DEM: ${km(roadsR?.km_under_water)}` : "No road table" },
          { label: "Bridges with an approach under water", value: share(c.bridges.approach_under_water, c.bridges.total), sub: `Raw DEM: ${r.bridges.approach_under_water}. A bridge counts when one end is on flooded land` },
        ]} />
      </div>
      <div className="mt-3">
        <Figures items={[
          { label: "Schools under water", value: share(c.school.under_water, c.school.total), sub: `Raw DEM: ${r.school.under_water}${c.school.no_value ? `. ${c.school.no_value} with no river-height value` : ""}` },
          { label: "Health facilities under water", value: share(c.health.under_water, c.health.total), sub: `Hospitals and clinics. Raw DEM: ${r.health.under_water}${c.health.no_value ? `. ${c.health.no_value} with no river-height value` : ""}` },
          { label: "Shelters under water", value: share(c.shelter.under_water, c.shelter.total), sub: `Mapped shelters. Raw DEM: ${r.shelter.under_water}` },
        ]} />
      </div>
      {listed.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700/70">
          <table className="w-full min-w-[420px] text-left text-[13.5px]">
            <caption className="sr-only">Named places on land under water</caption>
            <thead className="bg-ink-850/70 text-ink-200"><tr><th scope="col" className="px-3 py-2 font-medium">Place</th><th scope="col" className="px-3 py-2 font-medium">Type</th><th scope="col" className="px-3 py-2 font-medium text-right">Height above river</th></tr></thead>
            <tbody>{listed.map((x, i) => (
              <tr key={i} className="border-t border-ink-700/50 text-ink-100"><th scope="row" className="px-3 py-2 font-medium">{x.name}</th><td className="px-3 py-2">{KIND[x.kind] ?? x.kind}</td><td className="px-3 py-2 text-right tabular-nums">{x.height_above_river_m <= 0 ? "at or below river level" : `${x.height_above_river_m.toFixed(2)} m`}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {roadsC && (
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-300">
          {roadsC.km_under_water > 0 ? `Under water by road type: ${Object.entries(roadsC.km_under_water_by_class).filter(([, v]) => v > 0).map(([k, v]) => `${CLASS[k] ?? k} ${km(v)}`).join(", ")}. ` : ""}
          {cov != null && cov < 0.99 ? `River-height values exist for ${Math.round(cov * 100)}% of the mapped road length; the rest is never counted as flooded. ` : ""}
          Source: OpenStreetMap contributors{d.built ? `, table built ${d.built}` : ""}.
        </p>
      )}
    </div>
  );
}
