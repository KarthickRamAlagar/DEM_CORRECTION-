// Deterministic mock EDA numbers, seeded by dataset id so switching back and
// forth gives consistent (not jittering) results per dataset — same pattern
// as mockSpatialSample.js / the analytics correlation mock. This is
// illustrative UI, not computed from real rows: real per-column stats need
// actual dataset content (files or a backend), not just catalog metadata.
// A few fields below (rows, column count, bounding box) ARE pulled straight
// from the real catalog in datasets.js — those are called out at each call
// site, not hidden in here.

function hash(seed, i, salt = 0) {
  const v = Math.sin(seed * 12.9898 + i * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function seedFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h / 1000;
}

export function mockDataQuality(datasetId) {
  const seed = seedFromId(datasetId);
  const missing = Number((hash(seed, 1) * 4).toFixed(2));
  const duplicate = Number((hash(seed, 2) * 2).toFixed(2));
  return { missingPct: missing, duplicatePct: duplicate, validPct: Number((100 - missing - duplicate).toFixed(2)) };
}

export function mockDescriptiveStats(datasetId, columnName) {
  const seed = seedFromId(`${datasetId}:${columnName}`);
  const mean = 40 + hash(seed, 1) * 400;
  const std = 5 + hash(seed, 2) * 60;
  const min = mean - std * (1.5 + hash(seed, 3));
  const max = mean + std * (1.5 + hash(seed, 4));
  const median = mean + (hash(seed, 5) - 0.5) * std * 0.3;
  const q1 = mean - std * 0.67;
  const q3 = mean + std * 0.67;
  return {
    count: Math.round(50000 + hash(seed, 6) * 2000000),
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    range: Number((max - min).toFixed(2)),
    variance: Number((std * std).toFixed(2)),
    stdDev: Number(std.toFixed(2)),
    q1: Number(q1.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number((q3 - q1).toFixed(2)),
    cv: Number(((std / mean) * 100).toFixed(1)),
    skewness: Number(((hash(seed, 7) - 0.5) * 1.6).toFixed(2)),
    kurtosis: Number((2 + hash(seed, 8) * 3).toFixed(2)),
  };
}

export function mockHistogramBins(datasetId, columnName, bins = 20) {
  const seed = seedFromId(`${datasetId}:${columnName}:hist`);
  const peak = bins * (0.35 + hash(seed, 1) * 0.35);
  return Array.from({ length: bins }, (_, i) => {
    const dist = Math.abs(i - peak);
    const count = Math.max(2, Math.round(100 * Math.exp(-(dist * dist) / (2 * (bins / 4.5) ** 2)) + hash(seed, i, 2) * 12));
    return { x0: i, x1: i + 1, count };
  });
}

export function mockCorrelationMatrix(datasetId, columns) {
  const seed = seedFromId(datasetId);
  const n = columns.length;
  const matrix = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(1);
      } else if (j < i) {
        row.push(matrix[j][i]);
      } else {
        row.push(Number((hash(seed, i * n + j) * 2 - 1).toFixed(2)));
      }
    }
    matrix.push(row);
  }
  return matrix;
}

export function mockCategoricalCounts(datasetId, categories) {
  const seed = seedFromId(`${datasetId}:cat`);
  return categories.map((label, i) => ({
    label,
    count: Math.round(200 + hash(seed, i) * 4000),
  }));
}
