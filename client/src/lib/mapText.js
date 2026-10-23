// Plain-language description of a place flood map (master prompt sections 43 and 44).
// Built ONLY from the fields the /api/sdg/chain/scenario response already holds. Nothing is estimated here and nothing is invented.
// A missing value is said to be missing, never replaced by a number.
const n0 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v).toLocaleString("en-US"));
const n1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 }));
const COUNTRY = { IND: "India", NPL: "Nepal" };

function modelLine(name, t) {
  if (!t) return `${name}: no result is available.`;
  const parts = [];
  const a = n1(t.flooded_km2), p = n0(t.people), c = n1(t.cropland_ha), b = n0(t.buildings);
  if (a === null && p === null && c === null) return `${name}: no result is available.`;
  if (t.flooded_km2 === 0 && !t.people && !t.cropland_ha) return `${name}: no flooding inside the circle at this river rise.`;
  parts.push(a !== null ? `about ${a} square kilometres flooded` : "flooded area not available");
  parts.push(p !== null ? `about ${p} people` : "people count not available");
  parts.push(c !== null ? `about ${c} hectares of cropland` : "cropland not available");
  parts.push(b !== null ? `about ${b} buildings` : "building count not available for this place");
  return `${name}: ${parts.join(", ")}.`;
}

export function describeScenario(d) {
  if (!d || typeof d !== "object" || !d.scenario) return null;       // nothing to describe
  const lines = [];
  const lat = d.point?.lat, lon = d.point?.lon;
  const where = Number.isFinite(lat) && Number.isFinite(lon) ? ` around ${Math.abs(lat).toFixed(4)} degrees ${lat >= 0 ? "north" : "south"}, ${Math.abs(lon).toFixed(4)} degrees ${lon >= 0 ? "east" : "west"}` : "";
  const dist = d.here?.name ? `, in ${d.here.name}${COUNTRY[d.here.iso] ? `, ${COUNTRY[d.here.iso]}` : ""}` : "";
  const r = Number.isFinite(d.radius_km) ? `${n1(d.radius_km)} kilometre` : "";
  lines.push(`Map of a ${r} circle${where}${dist}.`.replace("  ", " "));
  if (Number.isFinite(d.rise_m)) lines.push(`It shows a what-if: the river rises ${n1(d.rise_m)} metres. This is not a forecast, and it has no flow physics.`);
  lines.push(modelLine("With the corrected elevation model", d.scenario.corrected));
  lines.push(modelLine("With the raw elevation model", d.scenario.raw));
  const c = d.river_height_coverage?.corrected;
  if (Number.isFinite(c)) lines.push(`River-height data covers ${Math.round(c * 100)} percent of the circle. Cells without it are not counted as flooded.`);
  if (d.clipped_to_layer) lines.push("The circle reaches outside the area where river-height data exists, so only the part inside is counted.");
  if (Array.isArray(d.districts) && d.districts.length) {
    const top = d.districts.slice(0, 3).filter((x) => n0(x.people) !== null).map((x) => `${x.name} ${COUNTRY[x.iso] ? `in ${COUNTRY[x.iso]} ` : ""}(${n0(x.people)} people)`);
    if (top.length) lines.push(`Most of the people affected, under the corrected model, live in ${top.join(", ")}.`);
  }
  lines.push("Colours on the map: blue is flooded in both models, violet only with the corrected model, amber only with the raw model.");
  lines.push("The corrected elevation model is not claimed to improve flood prediction. Counts are exposure, not casualties or damage.");
  return lines.join(" ");
}
