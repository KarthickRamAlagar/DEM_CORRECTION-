// Genuine geographic meridians/parallels (not decorative) — every 20°, so
// the "Coordinate Grid" layer is real, correct geometry, just a simple one.
export function buildGraticuleGeoJSON(stepDeg = 20) {
  const features = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const coords = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
  }
  for (let lat = -80; lat <= 80; lat += stepDeg) {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
  }
  return { type: "FeatureCollection", features };
}

// A handful of illustrative AOIs to cycle through with "New AOI" — a real
// draw tool (click-drag a rectangle/polygon) would need a library like
// leaflet-draw or @geoman-io/leaflet-geoman-free, not wired up yet.
export const AOI_PRESETS = [
  { id: "north-3", name: "AOI-North-3", label: "Northern India, Himalayan foothills", bounds: [[28.4, 76.6], [31.2, 80.1]] },
  { id: "west-coast", name: "AOI-West-1", label: "Western Ghats coastal belt", bounds: [[9.8, 74.9], [13.1, 77.2]] },
  { id: "gangetic", name: "AOI-Central-2", label: "Gangetic plain, agricultural belt", bounds: [[24.0, 80.5], [27.5, 85.0]] },
];

export function boundsCenter(bounds) {
  const [[s, w], [n, e]] = bounds;
  return [(s + n) / 2, (w + e) / 2];
}
