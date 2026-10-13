// Deterministic pseudo-random band sampling, seeded by lat/lon, so clicking
// the same spot twice gives the same reading instead of jittering — this is
// illustrative placeholder data, NOT a real reflectance lookup (that would
// need an actual raster tile read or a backend endpoint). Elevation, by
// contrast, IS real now — see src/lib/elevation.js — this file only covers
// the band signature chart.

function hash(lat, lon, salt = 0) {
  const v = Math.sin(lat * 12.9898 + lon * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v); // 0..1
}

export function sampleBands(lat, lon) {
  return [
    { name: "Blue", value: Math.round(hash(lat, lon, 2) * 60 + 10), color: "#60a5fa" },
    { name: "Green", value: Math.round(hash(lat, lon, 3) * 60 + 15), color: "#4ade80" },
    { name: "Red", value: Math.round(hash(lat, lon, 4) * 55 + 10), color: "#f2545b" },
    { name: "NIR", value: Math.round(hash(lat, lon, 5) * 80 + 20), color: "#d9c48a" },
  ];
}

