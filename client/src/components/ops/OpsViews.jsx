import { useMemo, useState } from "react";
import { Note, Tabs } from "../../pages/evaluation/ui";
import { Big, ChartCard, C, DataTable, HBars, KeyVals, LineSeries, Meter, NoData, PairBars, BinsChart, CoverageBars, Pill, Section, Spark, big, inr, isNo, num, pc, statusTone, when } from "./OpsUi";

const f2 = (v) => (isNo(v) ? null : Number(v).toFixed(2));
const f3 = (v) => (isNo(v) ? null : Number(v).toFixed(3));
const Grid = ({ cols = "sm:grid-cols-2 xl:grid-cols-4", children }) => <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>;
const pick = (rows, start) => (rows || []).find((r) => String(r.model).startsWith(start));

function fmtMetric(m) {
  const v = m.value;
  if (isNo(v)) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (m.unit === "fraction") return pc(v, v < 0.01 ? 3 : 1);
    return `${num(v, Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 3 : 1)}${m.unit ? ` ${m.unit}` : ""}`;
  }
  return String(v);
}

// ---------------------------------------------------------------- Overview
export function OverviewView({ L, health, goTo }) {
  const d = L?.data || {}, dem = d.dem || {}, raw = pick(dem.frozen, "Raw"), win = pick(dem.frozen, "WINNER");
  const l1 = (L?.layers || []).find((l) => l.id === 1), inputs = l1?.metrics.find((m) => m.label.startsWith("Model inputs filled"));
  const iv = d.uncertainty, api = health?.api;
  return (
    <div className="space-y-4">
      <Grid>
        <Big label="Height error, raw DEM → corrected" value={win && raw ? `${f2(raw.RMSE)} → ${f2(win.RMSE)} m` : null} sub={win && raw ? `${pc(1 - win.RMSE / raw.RMSE, 0)} lower on a strip the model never saw (RMSE)` : null} />
        <Big label="Interval coverage on unseen strip" value={iv ? pc(iv.frozen_coverage, 1) : null} sub={iv ? `target ${pc(iv.nominal, 0)}; below target, treat as approximate` : null} tone="text-signal-amber" />
        <Big label="Model inputs filled" value={inputs ? pc(inputs.value, 1) : null} sub="29 inputs in the golden table (radar left out on purpose)" />
        <Big label="Model and data" value={dem.model_version || null} sub={d.mlops?.rows_live ? `${num(d.mlops.rows_live)} rows in the golden table` : null} />
      </Grid>
      <Grid cols="sm:grid-cols-2 xl:grid-cols-4">
        <Big label="API speed (p95, last 5 min)" value={api && !isNo(api.p95_ms) ? `${Math.round(api.p95_ms)} ms` : null} sub={api ? `${api.requests} requests, error rate ${isNo(api.error_rate) ? "No data" : pc(api.error_rate, 1)}` : "Gateway not read yet"} />
        <Big label="Python analysis service" value={health ? (health.upstream?.ok ? "Answering" : "Not answering") : null} sub={health?.upstream ? `${health.upstream.ms} ms` : null} tone={health?.upstream?.ok ? "text-signal-green" : "text-signal-red"} />
        <Big label="Flood layer" value="Terrain what-if" sub="“River rises X m”. Not a forecast, no flow physics" tone="text-ink-100" />
        <Big label="Money figures" value="Estimated need" sub="Not a release decision. Nothing here authorises funds" tone="text-ink-100" />
      </Grid>
      <Section title="The ten metric layers" subtitle="Every layer is built from files that exist. A metric that was never computed stays “No data”. Click a layer to open all metrics.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
          {(L?.layers || []).map((l) => {
            const have = l.metrics.filter((m) => !isNo(m.value)).length;
            return (
              <button key={l.id} type="button" onClick={() => goTo("metrics", l.id)} className="text-left rounded-lg border border-ink-700/60 bg-ink-850/60 hover:border-signal-teal/50 px-3.5 py-3 transition-colors">
                <p className="text-[12px] text-ink-400">Layer {l.id}</p>
                <p className="mt-0.5 text-[14px] text-white leading-snug">{l.name}</p>
                <div className="mt-2.5 flex items-center justify-between gap-2"><Pill tone={statusTone(l.status)}>{l.status}</Pill><span className="text-[12px] text-ink-400 tabular-nums">{l.status === "Live" ? "live" : `${have} of ${l.metrics.length}`}</span></div>
              </button>
            );
          })}
        </div>
      </Section>
      {(dem.known_limits || []).length > 0 && <Note>{dem.known_limits.map((t) => String(t).replace(/\.?\s*$/, ".")).join(" ")}</Note>}
    </div>
  );
}

// ---------------------------------------------------------------- Space and satellite
const SOURCES = [
  ["CartoDEM", "The 30 m height model being corrected", "Model input (raw height)"],
  ["ICESat-2 ATL08", "Laser heights used as the reference (labels), 2018 to 2023", "Labels only"],
  ["Sentinel-2", "Colour bands and indices (NDVI, EVI, NDWI, NDSI, BSI)", "Model inputs"],
  ["Sentinel-1", "Radar VV and VH", "Left out: about 88% empty"],
  ["Copernicus GFM", "Observed flood extent, 20 m, 2019 to 2026 (Sentinel-1 based)", "Flood layers and exposure"],
  ["WorldPop, VIDA, WorldCover, OpenStreetMap", "People, buildings, cropland, rivers and facilities", "Exposure"],
];

export function SpaceView({ L }) {
  const d = L?.data || {}, dem = d.dem || {}, raw = pick(dem.frozen, "Raw"), win = pick(dem.frozen, "WINNER"), cv = dem.cv_protocols || [];
  const l3 = (L?.layers || []).find((l) => l.id === 3);
  const cvRaw = l3?.metrics.find((m) => m.label.includes("raw DEM"))?.value, cvCor = l3?.metrics.find((m) => m.label.includes("corrected RMSE"))?.value;
  const rows = [
    { label: "Unseen strip (frozen test)", raw: raw?.RMSE, corrected: win?.RMSE },
    { label: "Spatial 4-fold CV", raw: cvRaw, corrected: cvCor },
    { label: "Plains, unseen strip", raw: raw?.RMSE_plains, corrected: win?.RMSE_plains },
    { label: "Foothills, unseen strip", raw: raw?.RMSE_foothill, corrected: win?.RMSE_foothill },
  ].filter((r) => !isNo(r.raw) || !isNo(r.corrected));
  const bins = dem.error_bins, iv = d.uncertainty, shap = (d.shap || []).slice(0, 12);
  const ly = d.recorded_label_year;
  return (
    <div className="space-y-4">
      <Grid>
        <Big label="RMSE on the unseen strip" value={win ? `${f2(win.RMSE)} m` : null} sub={raw ? `raw ${f2(raw.RMSE)} m` : null} />
        <Big label="Median absolute error" value={win ? `${f2(win.MedAE)} m` : null} sub={raw ? `raw ${f2(raw.MedAE)} m` : null} />
        <Big label="90% error limit (LE90)" value={win ? `${f2(win.LE90)} m` : null} sub={raw ? `raw ${f2(raw.LE90)} m` : null} />
        <Big label="Bias" value={win ? `${Number(win.Bias).toFixed(3)} m` : null} sub={raw ? `raw ${Number(raw.Bias).toFixed(2)} m (CartoDEM sits above the reference)` : null} />
      </Grid>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Height error before and after" subtitle="RMSE in metres. Lower is better. The unseen strip was never used for fitting, tuning or choosing the model."
          legend={[{ label: "Raw CartoDEM", color: C.raw }, { label: "Corrected", color: C.good }]}
          columns={[{ key: "label", label: "Test" }, { key: "raw", label: "Raw (m)", right: true, fmt: f2 }, { key: "corrected", label: "Corrected (m)", right: true, fmt: f2 }]} rows={rows}
          footnote={cv[1] ? `Random split gives ${f2(cv[1].corrected_RMSE)} m on the same rows; it is lower only because neighbouring points leak between train and test, so it is not used for decisions.` : null}>
          {rows.length ? <PairBars rows={rows} /> : <NoData />}
        </ChartCard>
        <ChartCard title="How big the errors are" subtitle="Share of points in each size of error (pooled out-of-fold predictions, all rows)." legend={[{ label: "Raw CartoDEM", color: C.raw }, { label: "Corrected", color: C.good }]}
          columns={[{ key: "label", label: "Error size" }, { key: "raw", label: "Raw", right: true, fmt: (v) => pc(v, 1) }, { key: "corrected", label: "Corrected", right: true, fmt: (v) => pc(v, 1) }]}
          rows={bins ? bins.labels.map((lb, i) => ({ label: lb, raw: bins.raw[i], corrected: bins.corrected[i] })) : null}>
          {bins ? <BinsChart labels={bins.labels} raw={bins.raw} corrected={bins.corrected} /> : <NoData />}
        </ChartCard>
        <ChartCard title="How often the true height falls inside the band" subtitle="Terrain-aware 90% interval, scored on the unseen strip. Rough foothills fall short of the target."
          columns={[{ key: "label", label: "Terrain group" }, { key: "n", label: "Points", right: true, fmt: (v) => num(v) }, { key: "q90", label: "90% limit (m)", right: true, fmt: f2 }, { key: "value", label: "Inside the band", right: true, fmt: (v) => pc(v, 1) }]}
          rows={iv?.groups?.map((g) => ({ label: `${g.terrain}, ${g.roughness_tercile.toLowerCase()}`, n: g.n, q90: g.q90_m, value: g.coverage }))}>
          {iv?.groups ? <CoverageBars target={iv.nominal} rows={iv.groups.map((g) => ({ label: `${g.terrain}, ${g.roughness_tercile.toLowerCase()}`, value: g.coverage }))} /> : <NoData />}
        </ChartCard>
        <ChartCard title="What the model looks at" subtitle="Mean absolute SHAP value per input (top 12 of 29). Bigger means a bigger effect on the height correction."
          columns={[{ key: "label", label: "Input" }, { key: "value", label: "Mean |SHAP|", right: true, fmt: f3 }]} rows={shap.map((s) => ({ label: s.feature, value: s.value }))}>
          {shap.length ? <HBars rows={shap.map((s) => ({ label: s.feature, value: s.value }))} /> : <NoData />}
        </ChartCard>
      </div>
      <Section title="Unseen-strip scores for every candidate" subtitle="One scoring on the frozen strip. The chosen model is marked.">
        <DataTable dense columns={[{ key: "model", label: "Model" }, { key: "n", label: "Points", right: true, fmt: (v) => num(v) }, { key: "RMSE", label: "RMSE", right: true, fmt: f2 }, { key: "MAE", label: "MAE", right: true, fmt: f2 }, { key: "MedAE", label: "MedAE", right: true, fmt: f2 },
          { key: "LE90", label: "LE90", right: true, fmt: f2 }, { key: "Bias", label: "Bias", right: true, fmt: f3 }, { key: "RMSE_plains", label: "Plains", right: true, fmt: f2 }, { key: "RMSE_foothill", label: "Foothills", right: true, fmt: f2 }]} rows={dem.frozen || []} />
      </Section>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Satellite and reference data" subtitle="Fixed text for orientation, not read from a file.">
          <DataTable dense columns={[{ key: "0", label: "Source" }, { key: "1", label: "Used for" }, { key: "2", label: "In this system" }]} rows={SOURCES.map((s) => ({ 0: s[0], 1: s[1], 2: s[2] }))} />
        </Section>
        <Section title="Imagery year versus label year" subtitle="Terrain inputs do not change by year. Vegetation and colour inputs do. This is a stated limit.">
          {ly ? <DataTable dense columns={[{ key: "year", label: "Label year" }, { key: "rows", label: "Rows", right: true, fmt: (v) => num(v) }, { key: "matched", label: "Imagery year used" }]} rows={ly.rows} /> : <NoData />}
          {ly && <p className="mt-3 text-[12.5px] text-ink-400 leading-relaxed">{ly.reading} (recorded {ly.recorded_on})</p>}
        </Section>
      </div>
      <Note>Study area: Gangetic Plain with the Himalayan foothill margin (25–28 N, 80–84 E). Not validated for high mountains. The corrected DEM is not claimed to improve flood prediction.</Note>
    </div>
  );
}

// ---------------------------------------------------------------- Analyst
export function CountryTabs({ value, onChange, both }) {
  const t = [{ id: "IND", label: "India" }, { id: "NPL", label: "Nepal" }];
  if (both) t.push({ id: "ALL", label: "Both" });
  return <Tabs variant="pill" tabs={t} value={value} onChange={onChange} />;
}
const yearlyBy = (rows) => {
  const years = [...new Set((rows || []).map((r) => r.year))].sort();
  const get = (b, k) => years.map((y) => rows.find((r) => r.year === y && r.bound === b)?.[k] ?? null);
  return { years, get };
};

export function AnalystView({ L }) {
  const [iso, setIso] = useState("IND");
  const sdg = L?.data?.sdg, c = sdg?.countries?.[iso], fk = L?.data?.flood_skill;
  if (!sdg || !c) return <Note>No SDG tables were found by the metrics script, so there is nothing to show. Run <span className="font-mono">etl/metrics/build_metric_layers.py</span> after the SDG tables exist.</Note>;
  const up = c.ever.upper_union, lo = c.ever.lower_unflagged, y = yearlyBy(c.yearly);
  const name = iso === "IND" ? "India" : "Nepal";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><CountryTabs value={iso} onChange={setIso} />
        <p className="text-[12.5px] text-ink-400">{c.districts_covered} of {c.districts_total} districts have full satellite coverage and are included</p></div>
      <Grid>
        <Big label="People inside observed floods (2019–2026, upper bound)" value={big(up.people_exposed)} sub={`${pc(up.pct_people, 1) ?? "No data"} of district population; conservative ${big(lo.people_exposed) ?? "No data"}`} />
        <Big label="Cropland inside observed floods" value={isNo(up.cropland_ha_exposed) ? null : `${num(up.cropland_ha_exposed / 1000, 0)} k ha`} sub={`${pc(up.pct_cropland, 1) ?? "No data"} of district cropland; conservative ${isNo(lo.cropland_ha_exposed) ? "No data" : `${num(lo.cropland_ha_exposed / 1000, 0)} k ha`}`} />
        <Big label="Flooded area (ever, upper bound)" value={isNo(up.flooded_km2) ? null : `${num(up.flooded_km2)} km²`} sub={`conservative ${isNo(lo.flooded_km2) ? "No data" : `${num(lo.flooded_km2)} km²`}`} />
        <Big label="Buildings inside observed floods" value={big(up.buildings_exposed)} sub={isNo(up.buildings_exposed) ? "Footprints exist for part of the area only, so no total is shown" : "All included districts have footprints"} />
      </Grid>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title={`${name}: cropland in observed floods by year`} subtitle="Hectares. Two bounds because the radar service flags some scenes; the truth is probably between them or above."
          legend={[{ label: "Upper bound (unflagged + flagged scenes)", color: C.good }, { label: "Conservative (unflagged only)", color: C.second }]}
          columns={[{ key: "year", label: "Year" }, { key: "up", label: "Upper (ha)", right: true, fmt: (v) => num(v) }, { key: "lo", label: "Conservative (ha)", right: true, fmt: (v) => num(v) }]}
          rows={y.years.map((yr, i) => ({ year: yr, up: y.get("upper_union", "cropland_ha_exposed")[i], lo: y.get("lower_unflagged", "cropland_ha_exposed")[i] }))}>
          <LineSeries xs={y.years} fmt={(v) => big(v) ?? "0"} series={[{ name: "Upper", color: C.good, values: y.get("upper_union", "cropland_ha_exposed") }, { name: "Conservative", color: C.second, values: y.get("lower_unflagged", "cropland_ha_exposed") }]} />
        </ChartCard>
        <ChartCard title={`${name}: people in observed floods by year`} subtitle="Exposure only. It is not casualties and not damage."
          legend={[{ label: "Upper bound", color: C.good }, { label: "Conservative", color: C.second }]}
          columns={[{ key: "year", label: "Year" }, { key: "up", label: "Upper", right: true, fmt: (v) => num(v) }, { key: "lo", label: "Conservative", right: true, fmt: (v) => num(v) }]}
          rows={y.years.map((yr, i) => ({ year: yr, up: y.get("upper_union", "people_exposed")[i], lo: y.get("lower_unflagged", "people_exposed")[i] }))}>
          <LineSeries xs={y.years} fmt={(v) => big(v) ?? "0"} series={[{ name: "Upper", color: C.good, values: y.get("upper_union", "people_exposed") }, { name: "Conservative", color: C.second, values: y.get("lower_unflagged", "people_exposed") }]} />
        </ChartCard>
      </div>
      <Section title={`${name}: districts with the most people in observed floods`} subtitle="Upper bound, 2019–2026 combined footprint, districts with full coverage only.">
        <DataTable dense columns={[{ key: "district", label: "District" }, { key: "pop_exposed", label: "People", right: true, fmt: (v) => num(v) }, { key: "cropland_ha_exposed", label: "Cropland (ha)", right: true, fmt: (v) => num(v) }, { key: "need", label: "Estimated need (INR)", right: true, fmt: (_, r) => (isNo(r.need_min_inr) ? null : inrRange(r.need_min_inr, r.need_max_inr)) }]} rows={[...c.top_districts].sort((a, b) => (b.pop_exposed ?? 0) - (a.pop_exposed ?? 0))} />
      </Section>
      <Section title="Does the corrected DEM change the flood result?" subtitle={fk ? `Recorded ${fk.recorded_on} from a run you checked, not recomputed here.` : null}>
        {fk ? (
          <>
            <Grid cols="sm:grid-cols-2 xl:grid-cols-4">
              <Big label="IoU, raw DEM" value={f3(fk.iou_raw)} /><Big label="IoU, corrected DEM" value={f3(fk.iou_corrected)} />
              <Big label="ROC-AUC raw / corrected" value={`${fk.roc_auc_raw} / ${fk.roc_auc_corrected}`} /><Big label="Days corrected beat raw" value={`${fk.days_corrected_better} of ${fk.days_compared}`} sub="interval includes 0" />
            </Grid>
            <p className="mt-3 text-[13px] text-ink-300 leading-relaxed">{fk.reading} Flood covers {pc(fk.flood_share_of_valid_test_cells, 2)} of valid test cells; the rule is about {fk.lift_over_random}× better than random. Precision, recall, F1 and calibration were not computed.</p>
          </>
        ) : <NoData />}
      </Section>
      <Note tone="teal">Observed flood exposure comes from Copernicus GFM (Sentinel-1 radar). It is weak under dense vegetation, in cities and on flat sand, so real flooding is probably higher there. Population is a 2020 modelled snapshot; cropland is WorldCover class 40 (no crop type, no yield).</Note>
    </div>
  );
}

// ---------------------------------------------------------------- Fintech and policy
const statusTag = (s) => { const t = String(s || "").toLowerCase(); return t.startsWith("verified") ? "green" : t.startsWith("partly") || t.startsWith("read by eye") ? "amber" : "red"; };
const statusShort = (s) => { const t = String(s).split(/[:(]/)[0].trim(); return t.length > 38 ? `${t.slice(0, 36)}…` : t; };
const inrRange = (a, b) => { const x = inr(a), y = inr(b); return x && y ? `${x.replace(" crore", "")} – ${y.replace("INR ", "")}`.replace(/^(INR [\d.,]+)( – )/, "$1$2") : null; };
const aval = (o) => (!o ? null : o.value != null ? num(o.value, 2) : o.low != null ? (o.low === o.high ? num(o.low, 2) : `${num(o.low, 2)} to ${num(o.high, 2)}`) : null);

export function FintechView({ L }) {
  const [iso, setIso] = useState("ALL");
  const sdg = L?.data?.sdg, d = L?.data || {}, mlops = d.mlops || {}, lin = d.lineage, iv = d.uncertainty;
  const countries = sdg?.countries || {};
  const agg = useMemo(() => {
    const keys = iso === "ALL" ? Object.keys(countries) : [iso].filter((k) => countries[k]);
    if (!keys.length) return null;
    const sum = (f) => { const v = keys.map(f).filter((x) => !isNo(x)); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const get = (b, k) => sum((i) => countries[i].ever[b]?.[k]);
    const yrs = [...new Set(keys.flatMap((i) => countries[i].yearly.map((r) => r.year)))].sort();
    const yv = (b, k) => yrs.map((y) => sum((i) => countries[i].yearly.find((r) => r.year === y && r.bound === b)?.[k]));
    const top = keys.flatMap((i) => countries[i].top_districts.map((t) => ({ ...t, iso: i }))).sort((a, b) => (b.need_max_inr ?? 0) - (a.need_max_inr ?? 0));
    const upMax = get("upper_union", "need_max_inr"), top5 = top.slice(0, 5).reduce((a, b) => a + (b.need_max_inr || 0), 0);
    return { get, yrs, yv, top, upMax, top5share: upMax ? top5 / upMax : null, keys };
  }, [countries, iso]);
  if (!sdg || !agg) return <Note>No recovery-need table was found, so there is nothing to show here.</Note>;
  const loMin = agg.get("lower_unflagged", "need_min_inr"), loMax = agg.get("lower_unflagged", "need_max_inr"), upMin = agg.get("upper_union", "need_min_inr"), upMaxv = agg.get("upper_union", "need_max_inr");
  const A = sdg.assumptions || {};
  return (
    <div className="space-y-4">
      <Note tone="amber"><b>Estimated recovery need, not a release decision.</b> These are observed flood exposure multiplied by documented unit costs. They are not forecasts, not damage or loss estimates, and not an inflation or macro model. Nothing here authorises any release of funds.</Note>
      <CountryTabs value={iso} onChange={setIso} both />
      <Grid cols="sm:grid-cols-2 xl:grid-cols-4">
        <Big label="Conservative bound (2019–2026 ever)" value={isNo(loMin) ? null : inrRange(loMin, loMax)} sub="unflagged satellite scenes only; low – high unit-cost range" small />
        <Big label="Upper bound (2019–2026 ever)" value={isNo(upMin) ? null : inrRange(upMin, upMaxv)} sub="adds flagged scenes that follow rainfall better" small />
        <Big label="Sensitivity: upper ÷ conservative (high)" value={!isNo(upMaxv) && loMax ? `${(upMaxv / loMax).toFixed(2)}×` : null} sub="how much the radar flag choice alone moves the figure" />
        <Big label="Concentration: top 5 districts" value={pc(agg.top5share, 0)} sub="share of the upper-bound high figure" />
      </Grid>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Estimated recovery need by flood year" subtitle="High end of the unit-cost range, INR crore (1 crore = 10 million). Years differ because each year’s observed flood footprint differs."
          legend={[{ label: "Upper bound", color: C.good }, { label: "Conservative", color: C.second }]}
          columns={[{ key: "year", label: "Year" }, { key: "a", label: "Conservative low", right: true, fmt: inr }, { key: "b", label: "Conservative high", right: true, fmt: inr }, { key: "c", label: "Upper low", right: true, fmt: inr }, { key: "e", label: "Upper high", right: true, fmt: inr }]}
          rows={agg.yrs.map((y, i) => ({ year: y, a: agg.yv("lower_unflagged", "need_min_inr")[i], b: agg.yv("lower_unflagged", "need_max_inr")[i], c: agg.yv("upper_union", "need_min_inr")[i], e: agg.yv("upper_union", "need_max_inr")[i] }))}>
          <LineSeries xs={agg.yrs} fmt={(v) => `${num(v / 1e7, 0)}`} series={[{ name: "Upper", color: C.good, values: agg.yv("upper_union", "need_max_inr") }, { name: "Conservative", color: C.second, values: agg.yv("lower_unflagged", "need_max_inr") }]} />
        </ChartCard>
        <Section title="Where the need is concentrated" subtitle="Upper bound, high end, ever-flooded footprint. Amounts in INR; Nepal figures are converted at the fixed rate below.">
          <HBars fmt={(v) => `${num(v / 1e7, 1)} cr`} rows={agg.top.slice(0, 10).map((t) => ({ label: `${t.district} (${t.iso === "IND" ? "IN" : "NP"})`, value: t.need_max_inr || 0 }))} label="Estimated recovery need by district" />
        </Section>
      </div>
      <Section title="Policy-relevant measures this data supports" subtitle="Only measures the data can support are listed. No inflation, price or RBI-specific metric is computed.">
        <DataTable dense columns={[{ key: "m", label: "Measure" }, { key: "v", label: "Value" }, { key: "s", label: "Basis" }]} rows={[
          { m: "Agricultural exposure (cropland in observed floods)", v: (() => { const h = agg.get("upper_union", "cropland_ha_exposed"); return isNo(h) ? null : `${num(h / 1000, 0)} k ha`; })(), s: "WorldCover class 40 inside the GFM footprint; not yield loss" },
          { m: "People exposed", v: big(agg.get("upper_union", "people_exposed")), s: "WorldPop 2020 inside the GFM footprint; not casualties" },
          { m: "Scenario sensitivity", v: !isNo(upMaxv) && loMax ? `${(upMaxv / loMax).toFixed(2)}× between bounds` : null, s: "Conservative vs upper flood bound" },
          { m: "Production disruption, price or inflation link", v: null, s: "Not modelled. Needs economic data and validation" },
        ]} />
      </Section>
      <Section title="Assumptions behind the money figures" subtitle="Each value carries its own verification status, as in the funding configuration.">
        <DataTable dense columns={[{ key: "k", label: "Assumption" }, { key: "v", label: "Value" }, { key: "src", label: "Source" }, { key: "st", label: "Status", fmt: (v) => (v ? <span title={String(v)}><Pill tone={statusTag(v)}>{statusShort(v)}</Pill></span> : null) }]} rows={[
          { k: "INR to NPR rate", v: A.inr_to_npr ? `1 INR = ${A.inr_to_npr.value} NPR` : null, src: A.inr_to_npr?.source, st: A.inr_to_npr?.status },
          { k: "India: household size", v: aval(A.IND?.household_size), src: "Assumed range", st: A.IND?.household_size?.status },
          { k: "India: relief cash per household", v: A.IND?.relief_cash_per_household ? `INR ${num(A.IND.relief_cash_per_household.value)}` : null, src: A.IND?.relief_cash_per_household?.source, st: A.IND?.relief_cash_per_household?.status },
          { k: "India: crop input subsidy per ha", v: A.IND?.crop_per_ha ? `INR ${num(A.IND.crop_per_ha.low)} to ${num(A.IND.crop_per_ha.high)}` : null, src: A.IND?.crop_per_ha?.source, st: A.IND?.crop_per_ha?.status },
          { k: "Nepal: household size", v: aval(A.NPL?.household_size), src: "Census 2021 totals", st: A.NPL?.household_size?.status },
          { k: "Nepal: relief cash per household", v: A.NPL?.relief_cash_per_household ? `NPR ${num(A.NPL.relief_cash_per_household.low)} to ${num(A.NPL.relief_cash_per_household.high)}` : null, src: A.NPL?.relief_cash_per_household?.source, st: A.NPL?.relief_cash_per_household?.status },
        ]} />
        <p className="mt-3 text-[12.5px] text-ink-400 leading-relaxed">Housing is a separate ceiling and is never added to the need. Crop subsidy applies only where crop loss is 33% or more, so the crop line is a ceiling.</p>
      </Section>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Model and data risk, in plain words">
          <ul className="space-y-2.5 text-[13.5px] text-ink-200 leading-relaxed list-disc pl-5">
            <li>The height-error band covers {iv ? pc(iv.frozen_coverage, 1) : <NoData />} of unseen points against a {iv ? pc(iv.nominal, 0) : "90%"} target, and is weakest on rough foothills.</li>
            <li>The corrected DEM gives the same flood skill as the raw DEM in the recorded test. The money figures use observed floods, so they do not depend on the DEM correction.</li>
            <li>Flagged radar scenes are the largest swing factor, which is why two bounds are shown.</li>
            {mlops.rows_live && mlops.rows_trained_on && mlops.rows_live > mlops.rows_trained_on && <li>The golden table now has {num(mlops.rows_live - mlops.rows_trained_on)} more rows than the model was trained and scored on. Results were not re-run on them.</li>}
            <li>Several unit costs are only partly verified (see the status column).</li>
          </ul>
        </Section>
        <Section title="Audit trail" subtitle="What a reviewer can check to trace a number back to its source.">
          <KeyVals rows={[["Model version", d.dem?.model_version], ["Code version (git commit)", lin?.git_commit ? String(lin.git_commit).slice(0, 12) : null], ["Files hashed (SHA-256)", lin ? `${num(lin.artefacts_hashed)} of ${num(lin.artefact_count)}` : null], ["Dataset hash", (lin?.key_files || []).find((f) => f.path.endsWith("golden_dataset.parquet"))?.sha256?.slice(0, 16)], ["Uncommitted files at the time", lin?.git_uncommitted_files], ["Lineage built", when(lin?.created_utc)]]} />
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- System (live)
export function SystemView({ health, pipeline, history }) {
  const h = health, host = h?.host, gw = h?.gateway, api = h?.api;
  const memUsed = host ? (1 - host.mem_free_gb / host.mem_total_gb) * 100 : null;
  const diskUsed = host?.disk ? (1 - host.disk.free_gb / host.disk.total_gb) * 100 : null;
  const ser = (k) => history.map((x) => x[k]);
  const svc = [
    ["Gateway", h ? "Running" : null, h ? `up ${Math.floor(gw.uptime_s / 60)} min` : null, "green"],
    ["Python analysis service", h ? (h.upstream?.ok ? "Answering" : "Not answering") : null, h?.upstream ? `${h.upstream.ms} ms` : null, h?.upstream?.ok ? "green" : "red"],
    ["Cache", gw ? (gw.cache === "redis" ? "Redis in use" : "In memory") : null, gw?.cache === "redis" ? null : "Redis is not configured", gw?.cache === "redis" ? "green" : "amber"],
    ["PostgreSQL / PostGIS", null, "not connected to this page yet", "grey"],
    ["ML pipeline (idle or running)", null, "no job runner to read", "grey"],
  ];
  return (
    <div className="space-y-4">
      <Grid cols="sm:grid-cols-3">
        <Meter label="CPU" value={host?.cpu_percent} sub={host ? `${host.cpus} logical processors` : null} />
        <Meter label="Memory in use" value={memUsed} sub={host ? `${host.mem_free_gb} GB free of ${host.mem_total_gb} GB` : null} />
        <Meter label="Disk in use (project drive)" value={diskUsed} sub={host?.disk ? `${host.disk.free_gb} GB free of ${host.disk.total_gb} GB` : null} />
      </Grid>
      <Grid cols="sm:grid-cols-2 xl:grid-cols-4">
        <Big label="API latency p50 / p95 / p99" value={api && !isNo(api.p50_ms) ? `${Math.round(api.p50_ms)} / ${Math.round(api.p95_ms)} / ${Math.round(api.p99_ms)} ms` : null} sub={api ? `${api.requests} requests in the last ${Math.round(api.window_s / 60)} min` : null} small><div className="mt-2"><Spark values={ser("p95")} label="p95 latency, recent" /></div></Big>
        <Big label="Server error rate (5xx)" value={api ? (isNo(api.error_rate) ? "No requests yet" : pc(api.error_rate, 1)) : null} sub="monitoring calls are not counted" />
        <Big label="Gateway memory" value={gw ? `${gw.rss_mb} MB` : null} sub={gw ? `event loop p99 ${gw.event_loop_p99_ms} ms` : null}><div className="mt-2"><Spark values={ser("cpu")} color={C.second} label="CPU, recent" /></div></Big>
        <Big label="Last reading" value={h ? when(h.time) : null} sub="refreshes every 5 seconds while this tab is open" small />
      </Grid>
      <Section title="Services">
        <ul className="divide-y divide-ink-800/80">
          {svc.map(([n, st, sub, tone]) => (
            <li key={n} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]"><span className="text-ink-100">{n}</span>
              <span className="flex items-center gap-3 text-right">{sub && <span className="text-[12.5px] text-ink-400">{sub}</span>}{st ? <Pill tone={tone}>{st}</Pill> : <NoData />}</span></li>))}
        </ul>
      </Section>
      <Section title="Pipeline" subtitle={pipeline?.note || "Newest file change in each folder."}>
        <KeyVals rows={[["Last data processing (ETL)", when(pipeline?.last_etl)], ["Last feature or golden table build", when(pipeline?.last_feature_build)], ["Last model file written", when(pipeline?.last_model_file)]]} />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Data quality and lineage
export function ProvenanceView({ L }) {
  const d = L?.data || {}, lin = d.lineage, qt = d.quality_tables;
  const l1 = (L?.layers || []).find((l) => l.id === 1);
  return (
    <div className="space-y-4">
      <Section title="Data quality, layer 1" subtitle={l1?.note}>
        {l1 ? <KeyVals rows={l1.metrics.map((m) => [m.label, fmtMetric(m), m.note])} /> : <NoData />}
      </Section>
      {qt && <Section title="Tables checked" subtitle="Rows are never added across tables. Each table stands alone.">
        <DataTable dense columns={[{ key: "file", label: "Table" }, { key: "rows", label: "Rows", right: true, fmt: (v) => num(v) }, { key: "columns", label: "Columns", right: true }, { key: "rows_with_every_column_filled", label: "Rows fully filled", right: true, fmt: (v) => pc(v, 1) }, { key: "duplicate_rate", label: "Duplicates", right: true, fmt: (v) => pc(v, 3) }]} rows={qt} />
      </Section>}
      <Section title="Lineage" subtitle="Source → report. A step shows as not recorded when no file backs it.">
        {lin ? (
          <>
            <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(lin.chain || []).map((s, i) => (
                <li key={s.step} className="rounded-lg border border-ink-700/60 bg-ink-850/60 px-3.5 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><span className="text-white"><span className="text-ink-500 mr-2 tabular-nums">{i + 1}</span>{s.step}</span>{"recorded" in s ? <Pill tone={s.recorded ? "green" : "amber"}>{s.recorded ? "Recorded" : "Not recorded"}</Pill> : <Pill>By design</Pill>}</div>
                  <p className="mt-1 text-ink-400 break-words">{s.where}{s.value ? ` · ${String(s.value).slice(0, 12)}` : ""}{s.files != null ? ` · ${num(s.files)} files` : ""}</p>
                </li>))}
            </ol>
            <div className="mt-4"><KeyVals rows={[["Git branch and commit", lin.git_commit ? `${lin.git_branch || ""} ${String(lin.git_commit).slice(0, 12)}` : null], ["Python", lin.python], ["Built", when(lin.created_utc)]]} /></div>
            <div className="mt-4"><DataTable dense columns={[{ key: "path", label: "Key file" }, { key: "bytes", label: "Size (MB)", right: true, fmt: (v) => (isNo(v) ? null : num(v / 1e6, 1)) }, { key: "sha256", label: "SHA-256", fmt: (v) => (v ? <span className="font-mono text-[11.5px] break-all">{v}</span> : null) }]} rows={lin.key_files || []} /></div>
          </>
        ) : <NoData why="run etl/lineage/build_manifest.py" />}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- All metrics
export function MetricsView({ L, open }) {
  const [sel, setSel] = useState(open || 1);
  const layers = L?.layers || [];
  const lay = layers.find((l) => l.id === sel) || layers[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4">
      <nav aria-label="Metric layers" className="flex lg:flex-col gap-1.5 overflow-x-auto">
        {layers.map((l) => (
          <button key={l.id} type="button" onClick={() => setSel(l.id)} aria-current={lay?.id === l.id}
            className={`shrink-0 text-left rounded-lg border px-3 py-2 text-[13.5px] transition-colors ${lay?.id === l.id ? "border-signal-teal/60 bg-signal-teal/10 text-ink-100" : "border-ink-700/60 text-ink-300 hover:text-white"}`}>
            <span className="text-ink-500 mr-2 tabular-nums">{l.id}</span>{l.name}</button>))}
      </nav>
      {lay ? (
        <Section title={`Layer ${lay.id}: ${lay.name}`} subtitle={lay.note} right={<Pill tone={statusTone(lay.status)}>{lay.status}</Pill>}>
          <DataTable columns={[{ key: "label", label: "Metric" }, { key: "v", label: "Value", fmt: (_, r) => fmtMetric(r) }, { key: "note", label: "Note", fmt: (v) => v || "" }]} rows={lay.metrics} />
        </Section>
      ) : <NoData />}
    </div>
  );
}
