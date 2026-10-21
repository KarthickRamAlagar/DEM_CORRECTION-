import { fmtInt, fmtMoney, fmtPct, NO_DATA } from "../../lib/sdgApi";

// columns chosen per SDG tab; every value is real or "No data"
const COLS = {
  sdg2: [
    ["Cropland flooded (ha)", (r) => fmtInt(r.cropland_ha_exposed)],
    ["Share of district cropland", (r) => fmtPct(r.pct_cropland)],
    ["Flooded area (km²)", (r) => fmtInt(r.flooded_km2)],
  ],
  sdg11: [
    ["People exposed", (r) => fmtInt(r.pop_exposed)],
    ["Share of district people", (r) => fmtPct(r.pct_pop)],
    ["Buildings exposed", (r) => (r.buildings_exposed == null ? NO_DATA : fmtInt(r.buildings_exposed))],
  ],
  funding: [
    ["People exposed", (r) => fmtInt(r.pop_exposed)],
    ["Cropland flooded (ha)", (r) => fmtInt(r.cropland_ha_exposed)],
    ["Need (min)", (r) => fmtMoney(r.need_min, r.currency)],
    ["Need (max)", (r) => fmtMoney(r.need_max, r.currency)],
  ],
};

export default function DistrictTable({ rows, kind }) {
  const cols = COLS[kind];
  // district names can repeat (two "Bara", two "Saptari" in the Nepal boundary file): show the area to tell them apart
  const counts = {};
  (rows ?? []).forEach((r) => { counts[r.district] = (counts[r.district] ?? 0) + 1; });
  if (!rows?.length) return <div className="text-sm text-ink-400">{NO_DATA}</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700/60">
      <table className="w-full text-[13.5px]">
        <thead className="bg-ink-850/80 text-ink-200">
          <tr>
            <th className="text-left text-[13px] font-medium px-4 py-3">District</th>
            <th className="text-right text-[13px] font-medium px-4 py-3">Inside region</th>
            {cols.map(([h]) => (
              <th key={h} className="text-right text-[13px] font-medium px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.district_key} className="border-t border-ink-700/50 text-ink-100 hover:bg-ink-850/50">
              <td className="px-4 py-2.5">{r.district}{counts[r.district] > 1 && r.district_area_km2 != null ? <span className="text-ink-300"> ({Math.round(r.district_area_km2)} km²)</span> : null}</td>
              <td className="px-4 py-2.5 text-right text-ink-300">{Math.round((r.share_in_region ?? 0) * 100)}%</td>
              {cols.map(([h, f]) => (
                <td key={h} className="px-4 py-2.5 text-right tabular-nums">{f(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
