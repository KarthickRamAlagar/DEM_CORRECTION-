import { jsPDF } from "jspdf";
import { Flow, COL, num, money, range, DEV_NAME } from "./reportFlow";
import { reportVersionLine } from "./reportVersion";
import { elevationMap, floodMap, buildingMap, cellMap } from "./reportMaps";
import { addEvaluation } from "./evalSections";

export const REPORT_PREFIX = "DEM-AREA-SDG";
export const reportFileName = (d) => `${REPORT_PREFIX}-${d.point.lat.toFixed(3)}N-${d.point.lon.toFixed(3)}E.pdf`;

// The report for one place, in the look of the DEM-Correction Evaluation Report: the DEM engine inputs and result, the flood what-if,
// people, buildings, crops, micro and macro economics, then the model evaluation. The last page carries the developer footer.
// dem: result carried from New Inputs ({rawZ, correctedZ, zLo, zHi, date, inputs, engine}); extra: figures shown in the app;
// scene: /chain/scene; region: /chain/region; evalData: {e, spatial} for the model evaluation (optional).
export async function buildPlaceReport({ data, meta, dem = null, extra = {}, scene = null, region = null, evalData = null }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = data.scenario.corrected, r = data.scenario.raw, o = data.observed, m = data.money.corrected, mr = data.money.raw;
  const hh = (k) => (m.by_country.length ? m.by_country.reduce((s, x) => s + x[k], 0) : null);
  const where = data.here ? `${data.here.name} (${data.here.iso === "IND" ? "India" : "Nepal"})` : "Outside mapped districts";
  const coord = `${data.point.lat.toFixed(4)} N, ${data.point.lon.toFixed(4)} E`;
  const m2 = (v) => (v == null ? "No data" : `${v.toFixed(2)} m`);
  const hasDem = dem && dem.rawZ != null && dem.correctedZ != null;
  const delta = hasDem ? dem.correctedZ - dem.rawZ : null;
  const stamp = dem?.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const eng = dem?.engine ?? null;
  const sr = scene?.radius_km ?? data.radius_km;
  const mapNote = sr < data.radius_km ? `Maps show the inner ${sr} km of the ${data.radius_km} km circle. Totals above use the full circle.` : `Maps show the ${sr} km circle.`;
  const f = new Flow(doc, { label: "DEM-AREA-SDG Report" });
  const money2 = (a, b) => range(a, b, (v) => money(v, "INR"));
  const country = (iso) => (iso === "IND" ? "India" : "Nepal");

  // ---- page 1: title, decision card, key figures, what it tells us
  f.title("DEM-AREA-SDG report", "From the corrected elevation to people, crops and recovery need",
    `Place: ${where}. Coordinates: ${coord}. ${dem?.date ? "Date used by the model" : "Report created"}: ${stamp}.${dem?.forecast ? ` River forecast day used: ${dem.forecast.label}.` : ""} River rise (what-if): ${data.rise_m} m inside a ${data.radius_km} km circle.`);
  f.h2("Result");
  f.decision({
    badge: "Estimate for planning. Not a forecast", headline: hasDem ? `Corrected ground height ${m2(dem.correctedZ)}` : "No DEM engine result carried into this run",
    sub: hasDem ? `${delta < 0 ? "Lower" : "Higher"} by ${Math.abs(delta).toFixed(2)} m than the old estimate` : "Run the DEM engine on New Inputs first to add the corrected height here",
    cards: [
      { label: "Old estimate", title: "Raw DEM at this point", value: hasDem ? m2(dem.rawZ) : "No data", text: "Before the correction." },
      { label: "Predicted correction", title: "Corrected minus raw", value: hasDem ? `${delta.toFixed(2)} m` : "No data", text: eng?.rmse != null ? `Model error on unseen areas about ${eng.rmse} m.` : "Validated error not carried." },
      { label: "River rise (what-if)", title: "Terrain-based, no flow physics", value: `${data.rise_m} m`, text: "Same rise run on both elevation models." },
    ],
  });
  f.kpi([
    { label: "People exposed", value: num(c.people), sub: "2020 population estimate", color: COL.blue },
    { label: "Cropland under water", value: `${num(c.cropland_ha)} ha`, sub: "2021 land cover" },
    { label: "Flooded area", value: `${num(c.flooded_km2, 1)} sq km`, sub: `Raw DEM: ${num(r.flooded_km2, 1)} sq km` },
    { label: "Recovery need", value: money2(m.need_min_inr, m.need_max_inr), sub: "Estimate, not a release decision", color: COL.green },
  ]);
  f.h2("What the results tell us");
  f.bullet(`If the nearest river rose ${data.rise_m} m, about ${num(c.flooded_km2, 1)} sq km inside the ${data.radius_km} km circle would be under water on the corrected elevation (${num(r.flooded_km2, 1)} sq km on the raw one).`, COL.blue);
  f.bullet(`About ${num(c.people)} people and ${num(c.cropland_ha)} hectares of cropland sit on that land. This is exposure, not casualties or damage.`, [217, 119, 6]);
  f.bullet(`Estimated recovery need: ${money2(m.need_min_inr, m.need_max_inr)}. It is an estimate for planning. It is not a release decision and nobody is authorised by this report.`, COL.green);
  f.bullet(hasDem ? `The corrected height is ${Math.abs(delta).toFixed(2)} m ${delta < 0 ? "lower" : "higher"} than the old estimate. The report does not claim that the corrected DEM improves flood prediction.` : "This run did not start from a DEM engine result, so no corrected height is shown.", COL.blue);
  f.bullet(`Flood is a terrain what-if: land whose height above the nearest mapped river is at or below ${data.rise_m} m. No discharge, rainfall, embankments, bridges or time are modelled.`, [217, 119, 6]);

  // ---- page 2: index (filled at the end)
  f.newPage(); f.h1("Contents"); f.para("What is in this report and where to find it.", { size: 8.5, color: COL.grey });
  const indexPage = f.n;

  // ---- DEM engine inputs
  const groups = dem?.inputs ?? [];
  const row = (rows) => rows.map(([k, v]) => [k, v == null || Number.isNaN(v) ? "Not used by model" : String(v)]);
  if (groups.length) {
    f.section("DEM engine inputs");
    f.para("Terrain, vegetation, signal and neighbourhood values the correction model used for this point.", { size: 8, color: COL.grey });
    groups.forEach((g) => { f.h2(g.group); f.kv(row(g.rows), { w: [0.5, 0.5], head: ["Input", "Value"] }); });
  }

  // ---- engine result
  f.section("DEM engine result and validation");
  f.kpi([
    { label: "Old estimate", value: hasDem ? m2(dem.rawZ) : "No data", sub: "Raw DEM at this point" },
    { label: "New corrected value", value: hasDem ? m2(dem.correctedZ) : "No data", sub: hasDem ? `${delta < 0 ? "Lower" : "Higher"} by ${Math.abs(delta).toFixed(2)} m` : "", color: COL.blue },
    { label: "Predicted correction", value: hasDem ? `${delta.toFixed(2)} m` : "No data", sub: "Corrected minus raw" },
  ]);
  f.h2("Model validation");
  f.kv([
    ["Model", eng?.model ?? "No data"], ["Validated RMSE", eng?.rmse != null ? `${eng.rmse} m` : "No data"],
    ["Confidence", eng?.reliable == null ? "No data" : eng.reliable ? "Reliable" : "Low confidence"], ["Model version", eng?.version ?? "No data"],
    ["Uncertainty range (nominal 90%, approx.)", dem?.zLo != null ? `${m2(dem.zLo)} to ${m2(dem.zHi)}` : "No data"], [dem?.date ? "Date used" : "Report created", stamp],
  ]);
  f.h2("Location");
  f.kv([["Place", where], ["Coordinates", coord], ["Scenario circle", `${data.radius_km} km radius`], ["River rise (what-if)", `${data.rise_m} m`]]);
  if (!groups.length) f.para("Technical inputs: No data. Run the Technical User flow on New Inputs to list every input here.", { color: COL.grey });

  // ---- flood scenario
  f.section("Elevation and flood scenario");
  f.kpi([
    { label: "Flooded, corrected DEM", value: `${num(c.flooded_km2, 1)} sq km`, sub: "Terrain what-if", color: COL.blue },
    { label: "Flooded, raw DEM", value: `${num(r.flooded_km2, 1)} sq km`, sub: "Same river rise" },
    { label: "Difference", value: `${num(Math.round(c.flooded_km2 * 10) / 10 - Math.round(r.flooded_km2 * 10) / 10, 1)} sq km`, sub: "Corrected minus raw" },
  ]);
  f.h2("Scenario settings");
  f.kv([["River rise", `${data.rise_m} m (what-if)`], ["Circle radius", `${data.radius_km} km`],
    ["River-height data, corrected DEM", `${num(100 * data.river_height_coverage.corrected, 1)} % of the circle`], ["River-height data, raw DEM", `${num(100 * data.river_height_coverage.raw, 1)} % of the circle`]]);
  f.h2("Seen from satellite, 2019 to 2026");
  f.kv([["Flooded area, at least one year", range(o.lower.flooded_km2, o.upper.flooded_km2, (v) => `${num(v, 1)} sq km`)], ["People in that area", range(o.lower.people, o.upper.people, (v) => num(v))]]);
  f.para("Conservative to upper. A reality check for the what-if, not a forecast.", { size: 7.5, color: COL.grey });
  f.h2("How to read this");
  f.bullet(`Flooded means the height above the nearest mapped river is at or below ${data.rise_m} m. No flow physics: no discharge, embankments, rainfall, bridges or time.`);
  f.bullet("The corrected DEM is not shown to improve flood prediction. Exposure is not casualties or damage.", [217, 119, 6]);

  // ---- region comparison maps
  f.section("Comparison maps: region and elevation");
  f.para("Raw DEM, corrected DEM and where they differ, across the Nepal Terai and the Indian plains beside it.", { size: 8, color: COL.grey });
  if (region?.images) {
    const [[s0, w0], [n0, e0]] = region.bounds, asp = (n0 - s0) / ((e0 - w0) * Math.cos((((s0 + n0) / 2) * Math.PI) / 180));
    const dot = (x, y, w, h) => { const px = x + ((data.point.lon - w0) / (e0 - w0)) * w, py = y + ((n0 - data.point.lat) / (n0 - s0)) * h; doc.setFillColor(250, 204, 21); doc.setDrawColor(...COL.ink); doc.setLineWidth(0.3); doc.circle(px, py, 1.3, "FD"); doc.setLineWidth(0.2); };
    const img = (b) => (b ? `data:image/png;base64,${b}` : null);
    f.figures([{ caption: "Raw DEM flood", url: img(region.images.raw), aspect: asp, after: dot }, { caption: "Corrected DEM flood", url: img(region.images.corrected), aspect: asp, after: dot }, { caption: "Where they differ", url: img(region.images.difference), aspect: asp, after: dot }], { cols: 3 });
    f.legend([["Under water, both", COL.blue], ["Corrected DEM only", COL.violet], ["Raw DEM only", COL.orange]]);
    f.para(`River rise ${region.rise_m} m. Yellow dot is your place. Region map made from the 1 arc-second river-height layer; each block is about ${region.block_m} m.`, { size: 7.5, color: COL.grey });
  } else f.para("Region maps: No data. They could not be loaded for this report.", { color: COL.grey });
  if (scene?.terrain) {
    const a = elevationMap(scene, "raw"), b = elevationMap(scene, "corrected");
    f.h2(`Around your place, ${sr} km circle: the ground on the raw and on the corrected DEM`);
    f.figures([{ caption: "Raw DEM, shaded relief", url: a.url, aspect: a.aspect }, { caption: "Corrected DEM, shaded relief", url: b.url, aspect: b.aspect }]);
    f.para("Sand is lower ground and green is higher ground, relative to this circle. Dashed circle is the scenario radius.", { size: 7.5, color: COL.grey });
  }

  // ---- local flood comparison
  f.section("Comparison maps: flood");
  f.para(`A ${data.rise_m} m river rise inside the ${sr} km circle, raw against corrected.`, { size: 8, color: COL.grey });
  if (scene?.terrain) {
    const fr = floodMap(scene, "raw"), fc = floodMap(scene, "corrected"), fd = floodMap(scene, "diff");
    f.figures([{ caption: "Raw DEM: under water", url: fr.url, aspect: fr.aspect }, { caption: "Corrected DEM: under water", url: fc.url, aspect: fc.aspect }, { caption: "Where the two disagree", url: fd.url, aspect: fd.aspect }], { cols: 3 });
    f.legend([["Under water, both", COL.blue], ["Corrected DEM only", COL.violet], ["Raw DEM only", COL.orange]]);
    const cl = scene.totals?.cells, bl = scene.totals?.buildings;
    f.h2(`What changed, inner ${sr} km`);
    f.kv([["Buildings, corrected DEM only", bl ? num(bl.corrected_only) : "No data"], ["Buildings, raw DEM only", bl ? num(bl.raw_only) : "No data"],
      ["People, corrected DEM only", cl ? num(cl.corrected_only.people) : "No data"], ["People, raw DEM only", cl ? num(cl.raw_only.people) : "No data"],
      ["Cropland, corrected only", cl ? `${num(cl.corrected_only.crop_ha, 1)} ha` : "No data"], ["Cropland, raw only", cl ? `${num(cl.raw_only.crop_ha, 1)} ha` : "No data"]]);
    f.para(`${mapNote} Exposure from terrain height only. Not a forecast and not damage.`, { size: 7.5, color: COL.grey });
  } else f.para("Flood maps: No data. The 3D scene data could not be loaded for this report.", { color: COL.grey });

  // ---- buildings
  f.section("Buildings and people");
  f.h2("Buildings (SDG 11)");
  const bt = scene?.totals?.buildings;
  f.kpi([
    { label: "Buildings, corrected DEM", value: bt ? num(bt.corrected) : (c.buildings == null ? "No data" : num(c.buildings)), sub: `Inside the ${sr} km map. Not damage`, color: COL.blue },
    { label: "Buildings, raw DEM", value: bt ? num(bt.raw) : "No data", sub: `Inside the ${sr} km map` },
    { label: "Built-up land", value: `${num(c.builtup_ha)} ha`, sub: "ESA WorldCover 2021" },
  ]);
  if (scene) {
    const b1 = buildingMap(scene, "raw"), b2 = buildingMap(scene, "corrected");
    f.figures([{ caption: "Buildings, raw DEM", url: b1.url, aspect: b1.aspect }, { caption: "Buildings, corrected DEM", url: b2.url, aspect: b2.aspect }]);
    f.legend([["Building under water", [29, 78, 216]], ["Building not under water", [71, 85, 105]], ["Flooded ground", [147, 178, 240]]]); f.para(mapNote, { size: 7.5, color: COL.grey });
  }
  if (data.districts?.length) { f.h2("Districts touched"); f.table([{ label: "District", idx: 0, left: true, w: 3 }, { label: "People exposed", idx: 1, w: 1 }], data.districts.slice(0, 6).map((d) => [`${d.name} (${country(d.iso)})`, num(d.people)])); }
  f.need(100); f.h2("People and households (SDG 11 and SDG 2)");
  f.kpi([
    { label: "People exposed", value: num(c.people), sub: `Raw DEM: ${num(r.people)}`, color: COL.blue },
    { label: "Households (estimate)", value: range(hh("households_min"), hh("households_max"), (v) => num(v)), sub: "People divided by household size" },
    { label: "Share of circle", value: `${num(data.circle.people ? (100 * c.people) / data.circle.people : null, 1)} %`, sub: "Of people in the circle" },
  ]);
  if (scene) {
    const p1 = cellMap(scene, "raw", "people"), p2 = cellMap(scene, "corrected", "people");
    f.figures([{ caption: "People, raw DEM", url: p1.url, aspect: p1.aspect }, { caption: "People, corrected DEM", url: p2.url, aspect: p2.aspect }]);
    f.legend([["More people, not under water", [124, 58, 237]], ["People under water", [29, 78, 216]]]); f.para(`${mapNote} People are counted where the flooded cells are, not casualties.`, { size: 7.5, color: COL.grey });
  }
  if (extra.nutrition) f.kv([[extra.nutrition.label, [extra.nutrition.value, extra.nutrition.sub].filter(Boolean).join(". ")]], { head: ["Child nutrition where this place lies", "Value"] });

  // ---- land and crops
  f.section("Land and crops");
  f.para("SDG 2 Zero Hunger and SDG 12 Land and Production. Exposure, not crop loss.", { size: 8, color: COL.grey });
  f.kpi([
    { label: "Cropland under water", value: `${num(c.cropland_ha)} ha`, sub: `Raw DEM: ${num(r.cropland_ha)} ha`, color: COL.blue },
    { label: "Share of circle cropland", value: `${num(data.circle.cropland_ha ? (100 * c.cropland_ha) / data.circle.cropland_ha : null, 1)} %`, sub: "In the whole circle" },
    { label: "Seen flooded, 2019-2026", value: range(o.lower.cropland_ha, o.upper.cropland_ha, (v) => `${num(v)} ha`), sub: "Conservative to upper" },
  ]);
  if (scene) {
    const k1 = cellMap(scene, "raw", "crops"), k2 = cellMap(scene, "corrected", "crops");
    f.figures([{ caption: "Cropland, raw DEM", url: k1.url, aspect: k1.aspect }, { caption: "Cropland, corrected DEM", url: k2.url, aspect: k2.aspect }]);
    f.legend([["More cropland, not under water", [22, 163, 74]], ["Cropland under water", [29, 78, 216]]]); f.para(mapNote, { size: 7.5, color: COL.grey });
  }
  if (extra.crop) f.kv([[extra.crop.label, [extra.crop.value, extra.crop.sub].filter(Boolean).join(". ")]], { head: ["Crop value at the government price", "Value"] });
  f.para("Cropland is the 2021 land-cover share of each 90 m cell. The rice value is hectares under water times a state yield times the minimum support price, so it is a ceiling and not a loss estimate.", { size: 7.5, color: COL.grey });

  // ---- micro and macro economics
  f.section("Micro and macro economics");
  f.kpi([
    { label: "Need, corrected DEM", value: money2(m.need_min_inr, m.need_max_inr), sub: "Lowest to highest unit cost", color: COL.green },
    { label: "Need, raw DEM", value: money2(mr.need_min_inr, mr.need_max_inr), sub: "Sensitivity check" },
    { label: "Housing ceiling, not added", value: money(m.housing_ceiling_inr, "INR"), sub: "If every household lost its house" },
  ]);
  if (m.by_country.length) {
    f.h2("Micro: by country");
    f.table([{ label: "Country", idx: 0, left: true, w: 0.8 }, { label: "Households", idx: 1, left: true, w: 1.5 }, { label: "Relief cash", idx: 2, left: true, w: 2 }, { label: "Crop subsidy", idx: 3, left: true, w: 1.8 }, { label: "Need, INR", idx: 4, left: true, w: 2.2 }],
      m.by_country.map((x) => [country(x.iso), range(x.households_min, x.households_max, (v) => num(v)), range(x.relief_min, x.relief_max, (v) => money(v, x.currency)), x.crop_min == null ? "No data" : range(x.crop_min, x.crop_max, (v) => money(v, x.currency)), money2(x.need_min_inr, x.need_max_inr)]));
  }
  if (extra.econ?.length) { f.h2("Micro and macro context, whole state or province"); f.kv(extra.econ.map((e) => [e.label, [e.value, e.sub].filter(Boolean).join(". ")])); }
  f.h2("How reliable are the unit costs");
  m.by_country.forEach((x) => f.bullet(`${country(x.iso)}. Household size: ${x.status.household_size}. Relief cash: ${x.status.relief}. Crop subsidy: ${x.status.crop}.`));

  f.h2("Economics in context");
  f.para("Micro economics looks at single households and farms: how many are affected and what relief cash and crop support each would need. Macro economics looks at a whole state or country: output per person, poverty and spending, so the need can be seen against the size of the economy. Both are read together here.");
  f.h2("Who shaped India's modern economy");
  f.para("Dr Manmohan Singh (1932 to 2024) was the economist who, as India's Finance Minister from 1991, led the economic reforms that opened and liberalised the economy, and later served as Prime Minister from 2004 to 2014. He is widely described as the architect of India's economic reforms.");
  f.para("Why it matters here: recovery spending is read against the size and growth of the economy that carries it. The macro figures in this report come from official state releases.");
  f.para("Sources: ICMR India case study, Dr. Manmohan Singh, Father of Indian Reforms (icmrindia.org); Tradejini, Dr. Manmohan Singh, Architect of India's Economic Reform (tradejini.com).", { size: 7.5, color: COL.grey, italic: true });

  // ---- method and assumptions
  f.section("Method and assumptions");
  f.kv([
    ["Scenario", "Land with height above the nearest mapped river (HAND) at or below the chosen rise, inside a circle around the point. HAND is built from the raw and from the ML-corrected 2022 DEM at 1 arc-second, with OpenStreetMap rivers."],
    ["Exposure", "Flooded fraction of each 3 arc-second cell times WorldPop 2020 population, ESA WorldCover 2021 cropland and built-up share, and VIDA footprints where they cover the circle."],
    ["Observed floods", "Copernicus GFM ensemble flood extent, Sentinel-1, June to October 2019-2026. Conservative uses unflagged scenes only; upper adds flagged scenes."],
    ["Money", "Households = people divided by household size. Need = households times relief cash plus cropland hectares times crop input subsidy (India only). Housing is a separate ceiling. Nepal is converted at 1 INR = 1.60 NPR."],
  ], { w: [0.2, 0.8], head: ["Part", "How it is made"] });
  const a = meta?.assumptions;
  if (a) {
    const items = [["INR per NPR", `1 INR = ${a.inr_to_npr.value} NPR`, a.inr_to_npr.status]];
    ["IND", "NPL"].forEach((k) => { const x = a[k], hs = x.household_size, rc = x.relief_cash_per_household, nm = k === "IND" ? "India" : "Nepal";
      items.push([`${nm} household size`, hs.low === hs.high ? `${hs.low}` : `${hs.low} to ${hs.high}`, hs.status]); items.push([`${nm} relief cash per household`, `${rc.value ?? `${rc.low} to ${rc.high}`} ${x.currency}`, rc.status]); });
    f.h2("Assumptions and their status");
    f.table([{ label: "Assumption", idx: 0, left: true, w: 2 }, { label: "Value", idx: 1, left: true, w: 1.3 }, { label: "Status", idx: 2, left: true, w: 1.7 }], items);
  }

  // ---- model evaluation (same content as the Evaluation page report)
  addEvaluation(f, evalData ? { e: evalData.e, spatial: evalData.spatial } : { e: null, spatial: null });

  // ---- last page notes, then the developer footer
  f.h2("Method notes");
  f.bullet("This report is built from results stored by the DEM-Correction pipeline and the SDG layer. Please cross-verify them, as results can contain errors.");
  f.bullet("Scripts: etl/sdg/hand_nearest_channel.py, flood_annual.py, exposure_region.py, funding_need.py. Unit costs: etl/sdg/funding_config.json. API: server/sdg_chain_routes.py.");
  f.bullet("The PDF layer changes presentation only. It does not change the prediction or the input data.");

  f.fillIndex(indexPage);
  f.versionLine = await reportVersionLine();
  f.finish();
  void DEV_NAME;
  return doc;
}
