// Real endpoints, not placeholders — see the comments in
// src/data/imageryConfig.js for which satellites these actually apply to
// and why.

/**
 * GIBS date string in YYYY-MM-DD. Same-day imagery is frequently not fully
 * processed yet, so we default to yesterday (offsetDays=1) — GIBS's own
 * `/best/` path segment (used below) already picks the best available
 * product for whatever date you give it, but a date that's too recent can
 * still 404. Bump offsetDays if tiles look empty.
 */
export function gibsDateString(offsetDays = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * NASA GIBS WMTS tile URL template (Leaflet-style {z}/{y}/{x}).
 * Docs: https://nasa-gibs.github.io/gibs-api-docs/
 * `matrixLevel` varies per layer (how deep GIBS's Google-Maps-compatible
 * tile pyramid goes for that product) — check the layer's entry in the
 * GIBS product catalog before changing it, an unsupported level 404s.
 */
export function buildGibsUrl({ layer, matrixLevel = 9, date = gibsDateString() }) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level${matrixLevel}/{z}/{y}/{x}.jpg`;
}

/**
 * Sentinel Hub OGC WMS base URL under the Copernicus Data Space Ecosystem.
 * `instanceId` is NOT something we can supply — it's generated per-account
 * at https://dataspace.copernicus.eu under your Sentinel Hub "OGC/WMS/WMTS"
 * configurations, after creating a layer (e.g. TRUE-COLOR-S2L2A, or a custom
 * SAR backscatter evalscript layer for Sentinel-1).
 *
 * Confirmed: WMS/WCS/WFS/WMTS ("OGC") requests only need the instance ID in
 * the URL — no OAuth token. OAuth2 client credentials are only required for
 * the newer Process/Catalog/Batch/BYOC APIs, not these OGC endpoints. So a
 * blank map with a valid instance ID almost always means the *layer name*
 * doesn't match a layer that actually exists in your instance — see
 * `sentinelHubCapabilitiesUrl` below for how to check.
 */
export function sentinelHubWmsBaseUrl(instanceId) {
  return `https://sh.dataspace.copernicus.eu/ogc/wms/${instanceId}`;
}

/**
 * A GetCapabilities request lists every layer actually configured on your
 * instance, by name — the single fastest way to confirm what to put in
 * imageryConfig.js / your .env. Open the returned URL directly in a browser
 * tab; it's plain XML, no auth prompt.
 */
export function sentinelHubCapabilitiesUrl(instanceId) {
  return `${sentinelHubWmsBaseUrl(instanceId)}?SERVICE=WMS&REQUEST=GetCapabilities`;
}
