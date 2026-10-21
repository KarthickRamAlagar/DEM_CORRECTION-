// Satellite picture to drape over the 3D terrain, so the ground looks like the real place.
// Tiles: Esri World Imagery (attribution required, shown under the scene). If the tiles cannot be loaded the scene falls back to plain ground colours.
export const IMAGERY_ATTRIBUTION = "Imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community";
const URL_TPL = () => (typeof window !== "undefined" && window.__SCENE_TILE_URL__) || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const mx = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const my = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };

function loadTile(url) {
  return new Promise((resolve) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => resolve(im); im.onerror = () => resolve(null);
    im.src = url;
  });
}

// bounds = [west, south, east, north]. Returns a canvas (max 2048 px) or null.
export async function loadImagery(bounds, maxPx = 2048) {
  if (typeof document === "undefined") return null;
  const [w, s, e, n] = bounds;
  let z = 17;
  while (z > 12 && (Math.ceil(mx(e, z) / 256) - Math.floor(mx(w, z) / 256) + 1) > 9) z -= 1;
  const x0 = Math.floor(mx(w, z) / 256), x1 = Math.floor(mx(e, z) / 256), y0 = Math.floor(my(n, z) / 256), y1 = Math.floor(my(s, z) / 256);
  const big = document.createElement("canvas"); big.width = (x1 - x0 + 1) * 256; big.height = (y1 - y0 + 1) * 256;
  const bc = big.getContext("2d"); bc.fillStyle = "#3b4a3a"; bc.fillRect(0, 0, big.width, big.height);
  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const url = URL_TPL().replace("{z}", z).replace("{x}", tx).replace("{y}", ty);
    jobs.push(loadTile(url).then((im) => (im ? (bc.drawImage(im, (tx - x0) * 256, (ty - y0) * 256), 1) : 0)));
  }
  const got = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
  if (got === 0) return null;
  const sx = mx(w, z) - x0 * 256, sy = my(n, z) - y0 * 256, sw = mx(e, z) - mx(w, z), sh = my(s, z) - my(n, z);
  const k = Math.min(1, maxPx / Math.max(sw, sh));
  const out = document.createElement("canvas"); out.width = Math.max(2, Math.round(sw * k)); out.height = Math.max(2, Math.round(sh * k));
  out.getContext("2d").drawImage(big, sx, sy, sw, sh, 0, 0, out.width, out.height);
  out.partial = got < jobs.length;
  return out;
}
