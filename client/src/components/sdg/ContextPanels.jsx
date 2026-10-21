import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { fetchCropContext, fmtInt, NO_DATA } from "../../lib/sdgApi";
import { NUTRITION, ECON, MSP, range } from "../../lib/contextData";
import { Figures, DataTable } from "./Ui";

const rs = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pc = (v) => `${v.toFixed(1)}%`;
const rangeText = (r, f) => (r ? (r[0] === r[1] ? f(r[0]) : `${f(r[0])} to ${f(r[1])}`) : NO_DATA);
const rowOf = (rows, focus) => (focus ? rows.find((r) => r.area === focus) : null);
const countryName = (iso) => (iso === "NPL" ? "Nepal" : "India");
const level = (iso) => (iso === "NPL" ? "province" : "state");

export function Sources({ list, missing }) {
  return (
    <div className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-300">
      {list.map((s) => (
        <p key={s.url} className="m-0">
          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-100 underline underline-offset-2 hover:text-white">{s.name}<ExternalLink size={11} aria-hidden /></a>
          <span className="ml-2">{s.status === "official" ? "Read from the official release." : "Quoted by a secondary page, not yet checked against the official release."}</span>
        </p>
      ))}
      {missing && <p className="m-0 mt-1">{missing}</p>}
    </div>
  );
}

// Headline items used by the SDG 2 page (food and nutrition).
export function nutritionFigure(iso, focus) {
  const n = NUTRITION[iso] ?? NUTRITION.IND;
  const hit = rowOf(n.rows, focus);
  if (hit) return { label: `Child stunting, ${hit.area}`, value: pc(hit.stunted), sub: `Children under 5, whole ${level(iso)}. Not a figure for this exact place` };
  return { label: `Child stunting, ${level(iso)} level`, value: rangeText(range(n.rows, "stunted"), pc), sub: `${n.rows.length} ${level(iso)}${n.rows.length > 1 ? "s" : ""}, children under 5. Not a figure for this exact place` };
}

export function NutritionPanel({ iso, focus }) {
  const n = NUTRITION[iso] ?? NUTRITION.IND;
  const cols = [{ key: "a", label: iso === "NPL" ? "Province" : "State", render: (r) => r.area }, { key: "s", label: "Stunted", align: "right", render: (r) => pc(r.stunted) }];
  if (iso === "NPL") cols.push({ key: "w", label: "Wasted", align: "right", render: (r) => pc(r.wasted) });
  else cols.push({ key: "e", label: n.earlierLabel, align: "right", render: (r) => pc(r.earlier) });
  return (
    <div>
      <h4 className="mb-2 text-[14.5px] font-semibold text-white">{n.title}</h4>
      <DataTable caption={n.title} rows={n.rows} rowKey={(r) => r.area} columns={cols} highlight={(r) => r.area === focus} />
      <Sources list={n.src} missing={n.missing} />
    </div>
  );
}

export function EconPanels({ iso, focus }) {
  const e = ECON[iso] ?? ECON.IND;
  const microCols = iso === "NPL"
    ? [{ key: "a", label: "Province", render: (r) => r.area }, { key: "p", label: "Below the poverty line", align: "right", render: (r) => pc(r.poor) }]
    : [{ key: "a", label: "State", render: (r) => r.area }, { key: "r", label: "Rural", align: "right", render: (r) => rs(r.rural) }, { key: "u", label: "Urban", align: "right", render: (r) => rs(r.urban) }];
  return (
    <div className="space-y-8">
      <div>
        <h4 className="mb-2 text-[14.5px] font-semibold text-white">{e.micro.title}</h4>
        <DataTable caption={e.micro.title} rows={e.micro.rows} rowKey={(r) => r.area} columns={microCols} highlight={(r) => r.area === focus} />
        <Sources list={e.micro.src} missing={e.micro.missing} />
      </div>
      <div>
        <h4 className="mb-2 text-[14.5px] font-semibold text-white">{e.macro.title}</h4>
        {e.macro.rows.length ? (
          <DataTable caption={e.macro.title} rows={e.macro.rows} rowKey={(r) => r.area} highlight={(r) => r.area === focus}
            columns={[{ key: "a", label: "State", render: (r) => r.area }, { key: "g", label: "Total output", align: "right", render: (r) => `₹${(r.gsdpCr / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh crore` }, { key: "p", label: "Per person", align: "right", render: (r) => rs(r.perCap) }]} />
        ) : <p className="text-[14px] text-ink-300">{NO_DATA}</p>}
        <Sources list={e.macro.src} missing={e.macro.missing} />
      </div>
    </div>
  );
}

// headline figures for the money page
export function econFigures(iso, focus) {
  const e = ECON[iso] ?? ECON.IND;
  const mi = rowOf(e.micro.rows, focus), ma = rowOf(e.macro.rows, focus);
  if (mi) return [
    iso === "NPL" ? { label: `Micro: below the poverty line, ${mi.area}`, value: pc(mi.poor), sub: "Whole province" } : { label: `Micro: monthly spending per person, ${mi.area}`, value: `${rs(mi.rural)} rural, ${rs(mi.urban)} urban`, sub: "HCES 2023-24, whole state" },
    ma ? { label: `Macro: output per person, ${ma.area}`, value: rs(ma.perCap), sub: "2024-25, current prices, whole state" } : { label: "Macro: output", value: NO_DATA, noData: true, sub: "Not added yet. Nothing is estimated" },
  ];
  if (iso === "NPL") return [
    { label: "Micro: people below the poverty line", value: rangeText(range(e.micro.rows, "poor"), pc), sub: "By province, lowest to highest" },
    { label: "Macro: province output", value: NO_DATA, noData: true, sub: "Not added yet. Nothing is estimated" },
  ];
  return [
    { label: "Micro: monthly spending per person (rural)", value: rangeText(range(e.micro.rows.filter((r) => r.area !== "All India"), "rural"), rs), sub: "Uttar Pradesh to Bihar, HCES 2023-24" },
    { label: "Macro: output per person, 2024-25", value: rangeText(range(e.macro.rows, "perCap"), rs), sub: "Bihar to Uttar Pradesh, state level" },
  ];
}

// Rice value on the flooded cropland at MSP: hectares x state rice yield x 10 quintal per tonne x MSP. A ceiling, not damage.
export function riceValueRange(data, ha) {
  if (!data || ha == null) return null;
  const y = data.rows.filter((r) => r.crop === "Rice").map((r) => r.yield_t_per_ha);
  if (!y.length) return null;
  const f = (t) => ha * t * 10 * MSP.rice.price;
  return [f(Math.min(...y)), f(Math.max(...y))];
}
const crore = (v) => `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 1 })} crore`;
const croreRange = (r) => (r ? (Math.round(r[0] / 1e5) === Math.round(r[1] / 1e5) ? crore(r[0]) : `${crore(r[0])} to ${crore(r[1])}`) : NO_DATA);

export function CropPanel({ iso, ha }) {
  const q = useQuery({ queryKey: ["crop-ctx"], queryFn: fetchCropContext, retry: 0, enabled: iso !== "NPL" });
  if (iso === "NPL") return <p className="text-[14px] leading-relaxed text-ink-200 max-w-3xl">Nepal: recent district yield tables could not be obtained; only 2014/15 cereal tables are on disk and they are not shown as current. {NO_DATA}.</p>;
  if (q.isError) return <p className="text-[13.5px] leading-relaxed text-ink-300 max-w-3xl">{NO_DATA}. {q.error.message}</p>;
  if (!q.data) return <p className="text-[13.5px] text-ink-300">Loading the crop table...</p>;
  const val = riceValueRange(q.data, ha);
  return (
    <div>
      <DataTable caption="Crop yield by state" rows={q.data.rows} rowKey={(r) => r.state + r.crop}
        columns={[
          { key: "s", label: "State", render: (r) => r.state }, { key: "c", label: "Crop", render: (r) => r.crop }, { key: "y", label: "Year", render: (r) => r.year },
          { key: "a", label: "Area (ha)", align: "right", render: (r) => fmtInt(r.area_ha) }, { key: "p", label: "Production (t)", align: "right", render: (r) => fmtInt(r.production_t) },
          { key: "yy", label: "Yield (t per ha)", align: "right", render: (r) => r.yield_t_per_ha.toFixed(2) },
        ]} />
      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-300">India APY table on disk. Summed over districts and seasons. </p>
      <h4 className="mb-2 mt-7 text-[14.5px] font-semibold text-white">Minimum support price, ₹ per quintal</h4>
      <DataTable caption="Minimum support price" rows={Object.values(MSP)} rowKey={(r) => r.crop}
        columns={[{ key: "c", label: "Crop", render: (r) => r.crop }, { key: "s", label: "Season", render: (r) => r.season }, { key: "p", label: "MSP", align: "right", render: (r) => rs(r.price) }, { key: "pp", label: "Year before", align: "right", render: (r) => rs(r.previous) }]} />
      <Sources list={[MSP.rice.src, MSP.wheat.src]} />
      <div className="mt-6 rounded-xl border border-ink-700/60 bg-ink-900/50 p-5 max-w-3xl">
        <div className="text-[13px] text-ink-300">Rice on the flooded cropland, valued at the support price (a ceiling)</div>
        <div className="mt-1 text-[22px] font-semibold tabular-nums text-white">{croreRange(val)}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-300">Flooded hectares × state rice yield × ₹{MSP.rice.price.toLocaleString("en-IN")} per quintal, from the lowest to the highest of the two state yields. It assumes all flooded cropland grows rice and is lost completely, and the yield year is older than the price year. It is exposure valued at a government price, not a damage or loss estimate.</p>
      </div>
    </div>
  );
}

export function cropFigure(iso, data, ha) {
  if (iso === "NPL") return { label: "Crop yield and value at risk", value: NO_DATA, noData: true, sub: "No current Nepal yield table" };
  const val = riceValueRange(data, ha);
  if (!val) return { label: "Rice value on flooded cropland", value: NO_DATA, noData: true, sub: "Build the yield table (etl/sdg/crop_yield_state.py)" };
  return { label: "Rice on flooded cropland, at MSP", value: croreRange(val), sub: "A ceiling at the government price, not a loss estimate" };
}
