import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { StereoEffect } from "three/examples/jsm/effects/StereoEffect.js";
import { Glasses, ScanLine, Smartphone, RotateCcw, Columns2, Maximize2, Info } from "lucide-react";
import { makeFrame, buildTerrain, buildBuildings, buildPeople, buildFields, buildWater, disposeTree } from "../../lib/sceneWorld";
import { loadImagery, IMAGERY_ATTRIBUTION } from "../../lib/sceneImagery";

// What this device can do, with the reason when something is missing, so no button is just silently grey.
export function useDeviceModes() {
  const [m, setM] = useState({ webgl: null, vr: false, ar: false, tilt: false, secure: true, hasXr: false });
  useEffect(() => {
    let dead = false, webgl = false;
    try { const c = document.createElement("canvas"); webgl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { /* none */ }
    const tilt = "DeviceOrientationEvent" in window && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const base = { webgl, vr: false, ar: false, tilt, secure: !!window.isSecureContext, hasXr: !!navigator.xr };
    setM(base);
    const xr = navigator.xr;
    if (xr?.isSessionSupported) {
      Promise.all([xr.isSessionSupported("immersive-vr").catch(() => false), xr.isSessionSupported("immersive-ar").catch(() => false)])
        .then(([vr, ar]) => { if (!dead) setM({ ...base, vr, ar }); });
    }
    return () => { dead = true; };
  }, []);
  return m;
}

// Plain look (dark background, ground colours) is the default. Set to true for the satellite ground, sky, shadows and water sheets.
export const SATELLITE_GROUND = true;

const zee = new THREE.Vector3(0, 0, 1), eul = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function orient(q, a, b, g, s) { eul.set(b, a, -g, "YXZ"); q.setFromEuler(eul); q.multiply(q1); q.multiply(q0.setFromAxisAngle(zee, -s)); }

function skyTexture() {
  const c = document.createElement("canvas"); c.width = 8; c.height = 256;
  const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#2f6fb5"); g.addColorStop(0.55, "#9cc6ea"); g.addColorStop(1, "#e8e2d4");
  x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export default function Scene3D({ data, layer, dem, exag, heightM, modes, onStatus }) {
  const host = useRef(null);
  const api = useRef({});
  const [mode, setMode] = useState("orbit");                 // orbit | vr | ar | tilt | split
  const [imagery, setImagery] = useState(undefined);         // undefined loading, null failed, canvas ok
  const radiusM = (data.radius_km ?? 2) * 1000;
  const frame = useMemo(() => makeFrame(data), [data]);

  useEffect(() => {
    if (!SATELLITE_GROUND) { setImagery(null); return undefined; }
    let dead = false; setImagery(undefined); loadImagery(data.bounds).then((c) => !dead && setImagery(c)); return () => { dead = true; };
  }, [data]);

  // renderer, camera, controls, light, sky (once per data set)
  useEffect(() => {
    const el = host.current;
    if (!el || modes.webgl === false) return undefined;
    const scene = new THREE.Scene();
    const sky = SATELLITE_GROUND ? skyTexture() : new THREE.Color(0x0b1016); scene.background = sky;
    if (SATELLITE_GROUND) scene.fog = new THREE.Fog(0xcfd9e2, radiusM * 3.2, radiusM * 9);
    const camera = new THREE.PerspectiveCamera(45, 1, 5, 80000);
    const D = SATELLITE_GROUND ? radiusM * 1.5 : radiusM * 1.7;
    const home = () => { if (SATELLITE_GROUND) camera.position.set(-D * 0.55, D * 0.5, D * 0.85); else camera.position.set(0, D * 0.75, D * 0.95); controls.target.set(0, 0, 0); controls.update(); };
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = SATELLITE_GROUND; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    el.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
    scene.add(new THREE.HemisphereLight(0xdbeafe, SATELLITE_GROUND ? 0x6b705c : 0x1f2937, SATELLITE_GROUND ? 1.0 : 1.1));
    const sun = new THREE.DirectionalLight(0xfff3d6, SATELLITE_GROUND ? 2.2 : 1.4); sun.position.set(-0.7, 1, 0.5).multiplyScalar(radiusM * 1.6);
    sun.castShadow = SATELLITE_GROUND; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -radiusM * 1.3, right: radiusM * 1.3, top: radiusM * 1.3, bottom: -radiusM * 1.3, near: 10, far: radiusM * 6 });
    sun.shadow.bias = -0.0004; scene.add(sun);
    const world = new THREE.Group(); scene.add(world);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.485; controls.minDistance = 30; controls.maxDistance = radiusM * 5;
    const effect = new StereoEffect(renderer); effect.setEyeSeparation(radiusM * 0.012);
    const size = () => { const w = el.clientWidth || 600, h = el.clientHeight || 400; renderer.setSize(w, h, false); effect.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null; ro?.observe(el);
    let tilt = null, split = false, fly = SATELLITE_GROUND ? 0 : 1;
    if (SATELLITE_GROUND) camera.position.set(-D * 0.9, D * 1.1, D * 1.3); else camera.position.set(0, D * 0.75, D * 0.95);
    controls.update();
    renderer.setAnimationLoop(() => {
      if (fly < 1 && !renderer.xr.isPresenting) {                       // short fly-in from high above
        fly = Math.min(1, fly + 0.018); const k = 1 - (1 - fly) ** 3;
        camera.position.lerpVectors(new THREE.Vector3(-D * 0.9, D * 1.1, D * 1.3), new THREE.Vector3(-D * 0.55, D * 0.5, D * 0.85), k);
        camera.lookAt(0, 0, 0);
      }
      if (tilt) orient(camera.quaternion, tilt.a, tilt.b, tilt.g, tilt.s); else if (fly >= 1) controls.update();
      if (split) effect.render(scene, camera); else renderer.render(scene, camera);
    });
    api.current = { scene, camera, renderer, controls, world, sun, home, sky,
      setTilt: (t) => { tilt = t; controls.enabled = !t; }, setSplit: (v) => { split = v; size(); }, skipFly: () => { fly = 1; } };
    return () => {
      renderer.setAnimationLoop(null); ro?.disconnect(); controls.dispose(); sky.dispose?.();
      disposeTree(scene); renderer.dispose(); renderer.domElement.remove(); api.current = {};
    };
  }, [data, modes.webgl]); // eslint-disable-line react-hooks/exhaustive-deps

  // world content; rebuilt when a control changes or the satellite picture arrives
  useEffect(() => {
    const w = api.current.world;
    if (!w || imagery === undefined) return undefined;
    const terrain = buildTerrain(data, frame, dem === "raw" ? "raw" : "corrected", exag, imagery);
    // when comparing, colour the ground by the comparison, not by corrected alone
    const t2 = dem === "compare" ? buildTerrain(data, frame, "compare", exag, imagery) : terrain;
    const objs = [t2.mesh];
    const hAt = t2.hAt;
    if (layer === "buildings") objs.push(buildBuildings(data, frame, dem, hAt, heightM));
    else if (layer === "people") objs.push(buildPeople(data, frame, dem, hAt).mesh);
    else objs.push(buildFields(data, frame, dem, hAt).mesh);
    if (SATELLITE_GROUND) objs.push(buildWater(data, frame, dem, hAt, exag));
    objs.forEach((o) => w.add(o));
    if (t2 !== terrain) disposeTree(terrain.mesh);
    return () => { objs.forEach((o) => { w.remove(o); disposeTree(o); }); };
  }, [data, frame, layer, dem, exag, heightM, imagery, modes.webgl]);

  const place = (kind) => {
    const { world, sun } = api.current;
    if (!world) return;
    if (kind === "orbit") { world.scale.setScalar(1); world.position.set(0, 0, 0); return; }
    world.scale.setScalar(1.2 / (radiusM * 2));
    world.position.set(0, kind === "ar" ? -0.1 : 0.9, -1.1);
    void sun;
  };
  const note = (t) => onStatus?.(t);

  const startXr = async (kind) => {
    if (!navigator.xr || !(kind === "vr" ? modes.vr : modes.ar)) {
      const why = !modes.secure ? "WebXR only works on https:// or localhost. Open the app that way, then try again."
        : !modes.hasXr ? "This browser has no WebXR. Use Chrome or Edge on a desktop with a headset, or the Meta Quest browser."
        : kind === "vr" ? "No VR headset is connected to this browser. Connect one (or install the Immersive Web Emulator browser extension to test), then try again."
        : "AR needs a device with Chrome and ARCore, or an AR headset browser.";
      note(why); return;
    }
    const { renderer, scene } = api.current;
    try {
      const session = await navigator.xr.requestSession(kind === "vr" ? "immersive-vr" : "immersive-ar", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "dom-overlay"], domOverlay: kind === "ar" ? { root: host.current?.parentElement } : undefined });
      scene.background = kind === "ar" ? null : api.current.sky; place(kind); setMode(kind); note(null);
      session.addEventListener("end", () => { scene.background = api.current.sky; place("orbit"); setMode("orbit"); });
      await renderer.xr.setSession(session);
    } catch (e) { place("orbit"); setMode("orbit"); note(`Could not start ${kind.toUpperCase()}: ${String(e.message || e)}`); }
  };

  const motion = async () => {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== "granted") throw new Error("Motion access was not allowed");
    }
  };
  const startTilt = async (split) => {
    try {
      const { setTilt, setSplit, camera, skipFly } = api.current;
      skipFly();
      if (modes.tilt) {
        await motion();
        camera.position.set(0, 0, 0); place("tilt");
        const handler = (e) => setTilt({ a: THREE.MathUtils.degToRad(e.alpha || 0), b: THREE.MathUtils.degToRad(e.beta || 0), g: THREE.MathUtils.degToRad(e.gamma || 0), s: THREE.MathUtils.degToRad((screen.orientation && screen.orientation.angle) || 0) });
        window.addEventListener("deviceorientation", handler);
        api.current.stopTilt = () => window.removeEventListener("deviceorientation", handler);
      }
      if (split) { setSplit(true); host.current?.requestFullscreen?.().catch(() => {}); }
      setMode(split ? "split" : "tilt"); note(null);
    } catch (e) { note(String(e.message || e)); }
  };
  const stop = () => {
    const a = api.current;
    if (mode === "tilt" || mode === "split") { a.stopTilt?.(); a.setTilt(null); a.setSplit(false); place("orbit"); a.home(); if (document.fullscreenElement) document.exitFullscreen?.(); setMode("orbit"); }
    else a.renderer?.xr.getSession()?.end();
  };

  const Btn = ({ icon: Icon, label, ok, onClick, hint }) => (
    <button type="button" onClick={onClick} title={hint}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal ${ok ? "border-signal-teal/60 bg-signal-teal/10 text-ink-100 hover:bg-signal-teal/20" : "border-ink-600 text-ink-200 hover:text-white"}`}>
      <Icon size={15} aria-hidden /> {label}
    </button>
  );
  const chip = (ok, t) => <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] ${ok ? "border-signal-teal/50 text-signal-teal" : "border-ink-600 text-ink-300"}`}><span aria-hidden className={`h-2 w-2 rounded-full ${ok ? "bg-signal-teal" : "bg-ink-500"}`} />{t}</span>;

  return (
    <div>
      {modes.webgl === false ? (
        <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-6 text-[13px] text-ink-100">This browser cannot draw 3D (WebGL is off). The 2D maps and all numbers still work.</div>
      ) : (
        <div ref={host} role="img" aria-label="3D view of the flooded area" className="relative w-full overflow-hidden rounded-2xl border border-ink-700/60 shadow-lg" style={{ height: 520, touchAction: "none", background: "#0b1016" }}>
          {SATELLITE_GROUND && imagery === undefined && <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/55 px-2.5 py-1 text-[13px] text-white">Loading satellite picture...</span>}
        </div>
      )}
      {SATELLITE_GROUND && <p className="mt-1.5 text-[11.5px] text-ink-300">{imagery ? `${IMAGERY_ATTRIBUTION}.${imagery.partial ? " Some picture tiles did not load." : ""}` : imagery === null ? "The satellite picture could not be loaded here, so plain ground colours are used. Terrain, buildings and flood are unchanged." : ""}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mode === "orbit" ? (
          <>
            <Btn icon={Glasses} label="Enter VR" ok={modes.vr} onClick={() => startXr("vr")} hint="Headset view" />
            <Btn icon={ScanLine} label="Enter AR" ok={modes.ar} onClick={() => startXr("ar")} hint="Place the model on your table" />
            <Btn icon={Columns2} label="Split-screen VR" ok onClick={() => startTilt(true)} hint="Two eyes side by side, for a viewer box. Works on any device." />
            {modes.tilt && <Btn icon={Smartphone} label="Tilt view" ok onClick={() => startTilt(false)} hint="Move your device to look around" />}
            <Btn icon={Maximize2} label="Reset view" ok={false} onClick={() => { api.current.skipFly?.(); api.current.home?.(); }} />
          </>
        ) : (
          <Btn icon={RotateCcw} label={mode === "vr" || mode === "ar" ? "Leave XR" : "Leave this view"} ok onClick={stop} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-300">
        <span className="inline-flex items-center gap-1.5"><Info size={13} aria-hidden /> This device:</span>
        {chip(modes.vr, modes.vr ? "VR headset ready" : "No VR headset found")}
        {chip(modes.ar, modes.ar ? "AR ready" : "AR not available")}
        {chip(modes.secure, modes.secure ? "Secure page (https or localhost)" : "Not a secure page: XR is blocked")}
        <span>Drag to turn, scroll or pinch to zoom, right-drag to move.</span>
      </div>
    </div>
  );
}
