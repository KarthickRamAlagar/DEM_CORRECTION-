import { decodeTerrain, floodedIn } from "./sceneWorld";

// Plan-view maps for the PDF, drawn from the /chain/scene answer. Raw DEM and corrected DEM panels share one frame so they can be compared directly.
const BLUE = "#2563eb", VIOLET = "#8b5cf6", AMBER = "#f59e0b", SLATE = "#94a3b8";

function frameOf(scene, W) {
  const [w, s, e, n] = scene.bounds, k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const H = Math.round((W * (n - s)) / ((e - w) * k));
  return { W, H, px: (lon) => ((lon - w) / (e - w)) * W, py: (lat) => ((n - lat) / (n - s)) * H };
}
const mk = (W, H) => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };

function hillshade(scene, dem, f) {
  const T = decodeTerrain(scene.terrain);
  const c = mk(f.W, f.H), x = c.getContext("2d");
  x.fillStyle = "#f4f6f6"; x.fillRect(0, 0, f.W, f.H);
  if (!T) return c;
  const H = dem === "raw" ? T.raw : T.corrected, small = mk(T.nx, T.ny), sx = small.getContext("2d"), id = sx.createImageData(T.nx, T.ny);
  let lo = Infinity, hi = -Infinity; for (const v of H) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const at = (i, j) => H[Math.max(0, Math.min(T.ny - 1, i)) * T.nx + Math.max(0, Math.min(T.nx - 1, j))];
  for (let i = 0; i < T.ny; i++) for (let j = 0; j < T.nx; j++) {
    const dx = at(i, j + 1) - at(i, j - 1), dy = at(i + 1, j) - at(i - 1, j);
    const sh = Math.max(0, Math.min(1, 0.72 + (-dx - dy) * 0.012));
    const t = (H[i * T.nx + j] - lo) / Math.max(1, hi - lo);                  // low = sand, high = green
    const r = 226 - 70 * t, g = 218 - 20 * t, b = 190 - 60 * t, k = 0.62 + 0.38 * sh;
    const o = (i * T.nx + j) * 4; id.data[o] = r * k; id.data[o + 1] = g * k; id.data[o + 2] = b * k; id.data[o + 3] = 255;
  }
  sx.putImageData(id, 0, 0);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(small, 0, 0, f.W, f.H);
  return c;
}
function statusLayer(scene, mode, f) {              // mode raw | corrected | diff
  const T = decodeTerrain(scene.terrain); const c = mk(f.W, f.H); if (!T) return c;
  const small = mk(T.nx, T.ny), sx = small.getContext("2d"), id = sx.createImageData(T.nx, T.ny);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (let i = 0; i < T.nx * T.ny; i++) {
    const st = T.status[i] === 9 ? -1 : T.status[i];
    let col = null;
    if (mode === "diff") col = st === 1 ? BLUE : st === 2 ? VIOLET : st === 3 ? AMBER : null; else if (floodedIn(st, mode)) col = BLUE;
    if (col) { const [r, g, b] = rgb(col); id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = 175; }
  }
  sx.putImageData(id, 0, 0);
  const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.drawImage(small, 0, 0, f.W, f.H);
  return c;
}
function finish(c, scene, f) {
  const x = c.getContext("2d"), cx = f.px(scene.point.lon), cy = f.py(scene.point.lat);
  const rpx = (scene.radius_km * 1000) / (((scene.bounds[2] - scene.bounds[0]) * 111195 * Math.cos((scene.point.lat * Math.PI) / 180)) / f.W);
  x.strokeStyle = "#0b1016"; x.lineWidth = Math.max(2, f.W / 300); x.setLineDash([f.W / 60, f.W / 80]); x.beginPath(); x.arc(cx, cy, rpx, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  x.fillStyle = "#facc15"; x.strokeStyle = "#0b1016"; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, f.W / 90, 0, Math.PI * 2); x.fill(); x.stroke();
  x.strokeStyle = "#0b1016"; x.lineWidth = 4; x.strokeRect(0, 0, f.W, f.H);
  return c.toDataURL("image/png");
}
const base = (scene, dem, f) => { const c = hillshade(scene, dem, f); c.getContext("2d").globalAlpha = 1; return c; };

export function elevationMap(scene, dem, W = 640) { const f = frameOf(scene, W); return { url: finish(base(scene, dem, f), scene, f), aspect: f.H / f.W }; }
export function floodMap(scene, mode, W = 640) {
  const f = frameOf(scene, W), c = base(scene, mode === "raw" ? "raw" : "corrected", f); c.getContext("2d").drawImage(statusLayer(scene, mode, f), 0, 0);
  return { url: finish(c, scene, f), aspect: f.H / f.W };
}
export function buildingMap(scene, dem, W = 640) {
  const f = frameOf(scene, W), c = base(scene, dem, f), x = c.getContext("2d");
  x.drawImage(statusLayer(scene, dem, f), 0, 0);
  for (const [st, flat] of scene.buildings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < flat.length; i += 2) { const px = f.px(flat[i]), py = f.py(flat[i + 1]); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const wet = floodedIn(st, dem);
    x.fillStyle = wet ? "#1d4ed8" : "#475569"; x.fillRect(x0 - 0.8, y0 - 0.8, Math.max(2.6, x1 - x0 + 1.6), Math.max(2.6, y1 - y0 + 1.6));
  }
  return { url: finish(c, scene, f), aspect: f.H / f.W };
}
export function cellMap(scene, dem, kind, W = 640) {            // kind people | crops
  const f = frameOf(scene, W), c = base(scene, dem, f), x = c.getContext("2d");
  const key = kind === "people" ? 2 : 3, cellPx = (W / ((scene.bounds[2] - scene.bounds[0]) * 1200)) * 1.04;
  const maxV = Math.max(1e-6, ...scene.cells.map((q) => q[key]));
  for (const q of scene.cells) {
    if (q[key] <= 0) continue;
    const t = Math.sqrt(q[key] / maxV), wet = floodedIn(q[4], dem);
    x.fillStyle = wet ? `rgba(29,78,216,${0.35 + 0.65 * t})` : kind === "people" ? `rgba(124,58,237,${0.12 + 0.75 * t})` : `rgba(22,163,74,${0.12 + 0.75 * t})`;
    x.fillRect(f.px(q[0]) - cellPx / 2, f.py(q[1]) - cellPx / 2, cellPx, cellPx);
  }
  return { url: finish(c, scene, f), aspect: f.H / f.W };
}
