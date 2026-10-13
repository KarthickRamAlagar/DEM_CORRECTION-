// Real elevation data — not mocked. Open-Meteo's Elevation API is backed by
// the Copernicus GLO-90 DEM, is free, requires no API key, and (unlike most
// free elevation APIs) ships permissive CORS headers meant for direct
// browser use. Docs: https://open-meteo.com/en/docs/elevation-api
//
// Users of the Copernicus DEM are asked to cite: https://doi.org/10.5270/ESA-c5d3d65
const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";

/** Elevation (meters) at a single point, or null if the request fails. */
export async function fetchElevation(lat, lon) {
  const url = `${ELEVATION_URL}?latitude=${lat}&longitude=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation API HTTP ${res.status}`);
  const data = await res.json();
  const value = data?.elevation?.[0];
  return typeof value === "number" ? value : null;
}

/**
 * Elevation profile along a straight line between two points, sampled at
 * `steps + 1` evenly-spaced points and fetched in a single batched request
 * (Open-Meteo accepts comma-separated lat/lon lists).
 */
export async function fetchElevationProfile([lat1, lon1], [lat2, lon2], steps = 40) {
  const lats = [];
  const lons = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    lats.push(lat1 + (lat2 - lat1) * t);
    lons.push(lon1 + (lon2 - lon1) * t);
  }
  const url = `${ELEVATION_URL}?latitude=${lats.join(",")}&longitude=${lons.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation API HTTP ${res.status}`);
  const data = await res.json();
  const elevations = data?.elevation ?? [];

  // Cumulative great-circle distance in km, for the chart's x-axis.
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  let distKm = 0;
  return elevations.map((elevation, i) => {
    if (i > 0) {
      const dLat = toRad(lats[i] - lats[i - 1]);
      const dLon = toRad(lons[i] - lons[i - 1]);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lats[i - 1])) * Math.cos(toRad(lats[i])) * Math.sin(dLon / 2) ** 2;
      distKm += 2 * R * Math.asin(Math.sqrt(a));
    }
    return { distKm: Number(distKm.toFixed(2)), elevation, lat: lats[i], lon: lons[i] };
  });
}
