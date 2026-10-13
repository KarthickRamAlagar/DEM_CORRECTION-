// Approximates "what's below the satellite right now" from lat/lon using
// simple bounding boxes. This is a demo-grade heuristic, not real reverse
// geocoding — coastlines and borders are fuzzy, and edge cases near borders
// will misclassify. For production accuracy, swap this for a proper
// point-in-polygon lookup (e.g. Turf.js against a countries/continents
// GeoJSON, or a reverse-geocoding API) using the same [lon, lat] input.
export function getSubpointRegion(lat, lon) {
  // India gets its own check (called out specifically), ahead of the
  // broader Asia box.
  if (lat >= 6 && lat <= 36 && lon >= 68 && lon <= 97.5) return "India";

  if (lat <= -60) return "Antarctica";
  if (lat >= -35 && lat <= 38 && lon >= -18 && lon <= 52) return "Africa";
  if (lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45) return "Europe";
  if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return "Oceania";
  if (lat >= 7 && lat <= 83 && lon >= -170 && lon <= -50) return "North America";
  if (lat >= -56 && lat <= 13 && lon >= -82 && lon <= -34) return "South America";
  if (lat >= -11 && lat <= 77 && lon >= 45 && lon <= 180) return "Asia";

  if (lat >= 66) return "Arctic Ocean";
  if (lon >= -70 && lon < 20) return "Atlantic Ocean";
  if (lon >= 20 && lon < 110) return "Indian Ocean";
  return "Pacific Ocean";
}
