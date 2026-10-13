import { TileLayer, WMSTileLayer } from "react-leaflet";
import { imageryConfig } from "../data/imageryConfig";
import { buildGibsUrl, sentinelHubWmsBaseUrl } from "../lib/imagery";

// A Sentinel Hub "instance" is usually built from ONE template — it's common
// for an instance with a working Sentinel-2 true-color layer to have NO
// Sentinel-1 layer at all. Per-satellite overrides let you point each at a
// different instance if you created separate ones. See .env.example.
const SHARED_INSTANCE_ID = import.meta.env.VITE_SENTINELHUB_INSTANCE_ID;
export const INSTANCE_ID_BY_SAT = {
  "SENTINEL-1A": import.meta.env.VITE_SENTINELHUB_S1_INSTANCE_ID || SHARED_INSTANCE_ID,
  "SENTINEL-2A": import.meta.env.VITE_SENTINELHUB_S2_INSTANCE_ID || SHARED_INSTANCE_ID,
};

// FIX (root cause found): the earlier key was a CARTO WORKSPACE API
// Access Token (for querying your own data via the Maps/SQL API,
// region-specific base URL like gcp-asia-northeast1.api.carto.com) -
// a completely different CARTO product from the public basemap tile
// service. basemaps.cartocdn.com needs its OWN separate key, obtained
// free and instantly at https://carto.com/basemaps/apikey (no
// organization/region involved - just a simple signup form).
//
// Style choice: "dark_all" = dark map (current). Other built-in
// options: "light_all" (clean light background), "voyager" (colorful,
// like Image 2 - roads/parks/labels visible). Swap the word below to
// change the whole app's basemap look - purely cosmetic, unrelated to
// the API key itself.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;
const BASEMAP_STYLE = "dark_all"; // try "voyager" or "light_all" too

export const DARK_BASEMAP_URL = CARTO_API_KEY
  ? `https://{s}.basemaps.cartocdn.com/${BASEMAP_STYLE}/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`
  : `https://{s}.basemaps.cartocdn.com/${BASEMAP_STYLE}/{z}/{x}/{y}.png`;
export const DARK_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function imageryStatus(satId) {
  const config = imageryConfig[satId];
  if (!config) return { config: null, needsInstanceId: false, instanceId: null };
  const instanceId = config.type === "sentinelhub-wms" ? INSTANCE_ID_BY_SAT[satId] : null;
  return { config, needsInstanceId: config.type === "sentinelhub-wms" && !instanceId, instanceId };
}

/** Renders the real GIBS or Sentinel Hub tile layer for a satellite, if configured. */
export default function ImageryOverlayLayer({ satId, opacity = 0.85 }) {
  const { config, instanceId } = imageryStatus(satId);
  if (!config) return null;

  if (config.type === "gibs") {
    return (
      <TileLayer
        key={`${satId}-gibs`}
        url={buildGibsUrl({ layer: config.layer, matrixLevel: config.matrixLevel })}
        attribution="Imagery: NASA GIBS / MODIS"
        opacity={opacity}
      />
    );
  }

  if (config.type === "sentinelhub-wms") {
    if (!instanceId) return null;
    return (
      <WMSTileLayer
        key={`${satId}-shwms-${config.layer}`}
        url={sentinelHubWmsBaseUrl(instanceId)}
        layers={config.layer}
        version="1.3.0"
        format="image/png"
        transparent
        opacity={opacity}
        attribution="Imagery: Copernicus Data Space Ecosystem / Sentinel Hub"
      />
    );
  }

  return null;
}