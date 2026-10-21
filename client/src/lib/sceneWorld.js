import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Builds the 3D world (terrain, then buildings or people or crops) from the /chain/scene answer.
// Local metres: x east, z south, y up. Colours match the 2D maps: blue both, violet corrected only, amber raw only.
export const KM_DEG = 111195;
const BOTH = 0x2563eb, CORR = 0x8b5cf6, RAW = 0xf59e0b, DRY = 0x64748b, NORIVER = 0x334155, CROP = 0x4ade80, PEOPLE = 0xcbd5e1;

export function floodedIn(st, dem) {
  if (st == null || st < 0) return false;
  if (dem === "raw") return st === 1 || st === 3;
  if (dem === "corrected") return st === 1 || st === 2;
  return st > 0;
}
export function colourFor(st, dem, dry = DRY) {
  if (st == null || st < 0) return NORIVER;
  if (dem === "compare") return st === 1 ? BOTH : st === 2 ? CORR : st === 3 ? RAW : dry;
  return floodedIn(st, dem) ? BOTH : dry;
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const i16 = (s) => { const u = b64(s); return new Int16Array(u.buffer, u.byteOffset, u.byteLength >> 1); };

export function makeFrame(data) {
  const [w, s, e, n] = data.bounds, lat0 = (s + n) / 2, lon0 = (w + e) / 2, k = Math.cos((lat0 * Math.PI) / 180);
  return { lon0, lat0, X: (lon) => (lon - lon0) * KM_DEG * k, Z: (lat) => -(lat - lat0) * KM_DEG, widthM: (e - w) * KM_DEG * k, depthM: (n - s) * KM_DEG, cellX: (3 / 3600) * KM_DEG * k, cellZ: (3 / 3600) * KM_DEG };
}

export function buildTerrain(data, frame, dem, exag, imagery = null) {
  const t = data.terrain;
  if (!t) {
    const g = new THREE.PlaneGeometry(frame.widthM, frame.depthM, 1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    return { mesh: m, hAt: () => 0 };
  }
  const H = i16(dem === "raw" ? t.raw : t.corrected), S = b64(t.status), nx = t.nx, ny = t.ny;
  const g = new THREE.PlaneGeometry(frame.widthM, frame.depthM, nx - 1, ny - 1).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  let hmin = Infinity, hmax = -Infinity;
  for (let i = 0; i < H.length; i++) { hmin = Math.min(hmin, H[i]); hmax = Math.max(hmax, H[i]); }
  const span = Math.max(1, hmax - hmin);
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    const idx = i * nx + j, h = (H[idx] - hmin) * 0.1 * exag;
    pos.setY(idx, h);
    const st = S[idx] === 9 ? -1 : S[idx];
    const shade = 0.35 + 0.35 * ((H[idx] - hmin) / span);
    c.setRGB(0.36 * shade + 0.1, 0.42 * shade + 0.12, 0.3 * shade + 0.08);                 // muted ground
    if (floodedIn(st, dem)) c.lerp(new THREE.Color(colourFor(st, dem)), 0.78);
    else if (dem === "compare" && st > 0) c.lerp(new THREE.Color(colourFor(st, dem)), 0.78);
    col[idx * 3] = c.r; col[idx * 3 + 1] = c.g; col[idx * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  let mat;
  if (imagery) {
    // satellite picture on the ground, with the flood colours painted over it (soft edges)
    const cv = document.createElement("canvas"); cv.width = imagery.width; cv.height = imagery.height;
    const cx = cv.getContext("2d"); cx.drawImage(imagery, 0, 0);
    const mask = document.createElement("canvas"); mask.width = nx; mask.height = ny;
    const mx2 = mask.getContext("2d"), id = mx2.createImageData(nx, ny);
    for (let i = 0; i < nx * ny; i++) {
      const st = S[i] === 9 ? -1 : S[i];
      const wet = floodedIn(st, dem) || (dem === "compare" && st > 0);
      const cc = new THREE.Color(colourFor(st, dem));
      id.data[i * 4] = cc.r * 255; id.data[i * 4 + 1] = cc.g * 255; id.data[i * 4 + 2] = cc.b * 255; id.data[i * 4 + 3] = wet ? 150 : 0;
    }
    mx2.putImageData(id, 0, 0);
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(mask, 0, 0, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  } else {
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  }
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  const hAt = (x, z) => {
    const fx = ((x + frame.widthM / 2) / frame.widthM) * (nx - 1), fy = ((z + frame.depthM / 2) / frame.depthM) * (ny - 1);
    const j = Math.max(0, Math.min(nx - 1, Math.round(fx))), i = Math.max(0, Math.min(ny - 1, Math.round(fy)));
    return (H[i * nx + j] - hmin) * 0.1 * exag;
  };
  return { mesh, hAt };
}

const ROOF = 0xe9e5dc, WALL_WET = 0x3b6ff0;
// Footprints are drawn 1.5x larger than the data so they can be seen from the orbit camera. Heights are one standard value.
export function buildBuildings(data, frame, dem, hAt, heightM) {
  const byColour = new Map();
  for (const [st, flat] of data.buildings) {
    if (flat.length < 6) continue;
    let pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(frame.X(flat[i]), -frame.Z(flat[i + 1])));
    const mxp = pts.reduce((a, p) => a + p.x, 0) / pts.length, myp = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    pts = pts.map((p) => new THREE.Vector2(mxp + (p.x - mxp) * 1.5, myp + (p.y - myp) * 1.5));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: heightM, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, hAt(mxp, -myp), 0);
    const colour = floodedIn(st, dem) || (dem === "compare" && st > 0) ? colourFor(st, dem) : ROOF;
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(geo);
  }
  const group = new THREE.Group();
  for (const [colour, geos] of byColour) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const wet = colour !== ROOF;
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55, metalness: 0.05, emissive: wet ? colour : 0x000000, emissiveIntensity: wet ? 0.35 : 0 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// A thin see-through water sheet on every flooded 90 m cell, so the flood reads as water standing on the ground.
export function buildWater(data, frame, dem, hAt, exag) {
  const cells = data.cells.filter((c) => floodedIn(c[4], dem) || (dem === "compare" && c[4] > 0));
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.2, depthWrite: false }), Math.max(1, cells.length));
  mesh.count = cells.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const th = 1.5 + exag * 0.35;
  cells.forEach((c, i) => {
    const x = frame.X(c[0]), z = frame.Z(c[1]);
    sc.set(frame.cellX * 1.02, th, frame.cellZ * 1.02); p.set(x, hAt(x, z) + th / 2, z);
    mesh.setMatrixAt(i, m4.compose(p, q, sc)); mesh.setColorAt(i, col.set(colourFor(c[4], dem)));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 2;
  return mesh;
}

export function buildCells(data, frame, dem, hAt, layer) {
  const cells = data.cells.filter((c) => (layer === "people" ? c[2] >= 0.5 : c[3] >= 0.05));
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: layer === "crops", opacity: layer === "crops" ? 0.6 : 0.88 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cells.length));
  mesh.count = cells.length; mesh.castShadow = true;
  const maxV = Math.max(1e-6, ...cells.map((c) => (layer === "people" ? c[2] : c[3])));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), colour = new THREE.Color();
  cells.forEach((c, idx) => {
    const v = layer === "people" ? c[2] : c[3];
    const hgt = layer === "people" ? 4 + (v / maxV) * 220 : 2 + (v / maxV) * 9;
    const x = frame.X(c[0]), z = frame.Z(c[1]);
    sc.set(frame.cellX * 0.86, hgt, frame.cellZ * 0.86);
    p.set(x, hAt(x, z) + hgt / 2, z);
    m4.compose(p, q, sc);
    mesh.setMatrixAt(idx, m4);
    mesh.setColorAt(idx, colour.set(colourFor(c[4], dem, layer === "crops" ? CROP : PEOPLE)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, maxV };
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

export const LEGEND = {
  compare: [["Under water in both", "#2563eb"], ["Only with the corrected DEM", "#8b5cf6"], ["Only with the raw DEM", "#f59e0b"], ["Not under water", "#64748b"]],
  raw: [["Under water, raw DEM", "#2563eb"], ["Not under water", "#64748b"]],
  corrected: [["Under water, corrected DEM", "#2563eb"], ["Not under water", "#64748b"]],
};

// ---- people as little figures, crops as striped fields -------------------------------------------------------------
const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
export function peopleUnit(data) {
  const maxP = Math.max(1, ...data.cells.map((c) => c[2]));
  const target = maxP / 8;
  return NICE.find((n) => n >= target) ?? Math.ceil(target / 1000) * 1000;
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const FIGURE = 0xf2ece1;

export function buildPeople(data, frame, dem, hAt) {
  const unit = peopleUnit(data);
  const body = new THREE.CapsuleGeometry(1.1, 3.0, 2, 6).translate(0, 2.6, 0);
  const head = new THREE.SphereGeometry(1.25, 6, 5).translate(0, 6.1, 0);
  const geo = mergeGeometries([body, head], false); body.dispose(); head.dispose();
  const list = [];
  for (const c of data.cells) {
    if (c[2] < 0.5) continue;
    const n = Math.max(1, Math.min(10, Math.round(c[2] / unit)));
    for (let k = 0; k < n; k++) list.push([c, k]);
  }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.02 }), Math.max(1, list.length));
  mesh.count = list.length; mesh.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const S = 5;
  list.forEach(([c, k], i) => {
    const x = frame.X(c[0]) + (hash(i * 3 + k) - 0.5) * frame.cellX * 0.8, z = frame.Z(c[1]) + (hash(i * 5 + k + 9) - 0.5) * frame.cellZ * 0.8;
    sc.set(S, S * (0.9 + hash(i) * 0.25), S); p.set(x, hAt(x, z), z);
    mesh.setMatrixAt(i, m4.compose(p, q, sc));
    mesh.setColorAt(i, col.set(floodedIn(c[4], dem) || (dem === "compare" && c[4] > 0) ? colourFor(c[4], dem) : FIGURE));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, unit, figures: list.length };
}

let stripeTex = null;
function stripes() {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const x = c.getContext("2d");
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#3f8f3a" : "#79c14b"; x.fillRect(0, i * 8, 64, 8); }
  stripeTex = new THREE.CanvasTexture(c); stripeTex.colorSpace = THREE.SRGBColorSpace; stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.anisotropy = 4;
  return stripeTex;
}
// Each flat field tile is greener where more of the 90 m cell is cropland. Flooded cells take the flood colour.
export function buildFields(data, frame, dem, hAt) {
  const cells = data.cells.filter((c) => c[3] >= 0.05);
  const mat = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, cells.length));
  mesh.count = cells.length; mesh.receiveShadow = true;
  const maxV = Math.max(1e-6, ...cells.map((c) => c[3]));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  cells.forEach((c, i) => {
    const x = frame.X(c[0]), z = frame.Z(c[1]);
    sc.set(frame.cellX * 0.9, 2.2, frame.cellZ * 0.9); p.set(x, hAt(x, z) + 1.1, z);
    mesh.setMatrixAt(i, m4.compose(p, q, sc));
    const wet = floodedIn(c[4], dem) || (dem === "compare" && c[4] > 0);
    if (wet) col.set(colourFor(c[4], dem)).multiplyScalar(2.6); else { const k = 0.45 + 0.55 * (c[3] / maxV); col.setRGB(k, k, k); }
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh };
}

export function decodeTerrain(t) {
  if (!t) return null;
  return { raw: i16(t.raw), corrected: i16(t.corrected), status: b64(t.status), nx: t.nx, ny: t.ny };
}
