import { useEffect, useRef, useState } from "react";
import { mapkitTokenUrl } from "../../lib/sdgApi";

const SCRIPT = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
const COLOUR = { compare: { 1: "#2563eb", 2: "#8b5cf6", 3: "#f59e0b" }, raw: { 1: "#2563eb", 3: "#2563eb" }, corrected: { 1: "#2563eb", 2: "#2563eb" } };
const DRY = "#94a3b8";
const MAX_SHAPES = 4000;
const HALF = 1 / 2400;                                   // half of a 3 arc-second cell, in degrees

function loadMapKit() {
  if (window.mapkit) return Promise.resolve(window.mapkit);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT; s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.mapkit);
    s.onerror = () => reject(new Error("Could not load Apple MapKit JS (offline?)"));
    document.head.appendChild(s);
  });
}

// Apple Maps in a tilted 3D camera, with the same coloured footprints as the 3D blocks view.
// Apple draws its own real 3D buildings where it has them; ours are drawn on top as flat coloured footprints.
export default function AppleScene({ data, layer, dem, point }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const mapkit = await loadMapKit();
        if (dead) return;
        if (!mapRef.current) {
          mapkit.init({ authorizationCallback: (done) => fetch(mapkitTokenUrl(window.location.origin)).then((r) => r.json()).then((j) => done(j.token)).catch(() => setErr("Apple token refresh failed")) });
          mapRef.current = new mapkit.Map(ref.current, { mapType: mapkit.Map.MapTypes.Hybrid, showsMapTypeControl: true, isRotationEnabled: true });
        }
        const m = mapRef.current;
        m.removeOverlays(m.overlays);
        const c = new mapkit.Coordinate(data.point.lat, data.point.lon);
        const span = (data.radius_km * 2.6) / 111.195;
        m.region = new mapkit.CoordinateRegion(c, new mapkit.CoordinateSpan(span, span));
        try { m.cameraDistance = data.radius_km * 3200; m.rotation = 20; } catch (e) { /* older MapKit builds ignore tilt */ }
        const pal = COLOUR[dem] || COLOUR.compare;
        const col = (st) => pal[st] || null;
        const style = (hex, wet) => new mapkit.Style({ fillColor: hex, fillOpacity: wet ? 0.8 : 0.35, strokeColor: hex, lineWidth: 1 });
        const shapes = [];
        if (layer === "buildings") {
          for (const [st, flat] of data.buildings) {
            const hex = col(st);
            const pts = [];
            for (let i = 0; i < flat.length; i += 2) pts.push(new mapkit.Coordinate(flat[i + 1], flat[i]));
            if (pts.length >= 3 && shapes.length < MAX_SHAPES) shapes.push(new mapkit.PolygonOverlay(pts, { style: style(hex || DRY, !!hex) }));
          }
        } else {
          const key = layer === "people" ? 2 : 3;
          const cells = data.cells.filter((x) => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, MAX_SHAPES);
          for (const [lon, lat, , , st] of cells) {
            const hex = col(st);
            const pts = [[lat - HALF, lon - HALF], [lat - HALF, lon + HALF], [lat + HALF, lon + HALF], [lat + HALF, lon - HALF]].map(([a, b]) => new mapkit.Coordinate(a, b));
            shapes.push(new mapkit.PolygonOverlay(pts, { style: style(hex || (layer === "crops" ? "#4ade80" : "#cbd5e1"), !!hex) }));
          }
        }
        m.addOverlays(shapes);
        m.addAnnotation(new mapkit.MarkerAnnotation(c, { title: "Selected place", color: "#facc15" }));
      } catch (e) {
        if (!dead) setErr(String(e.message || e));
      }
    })();
    return () => { dead = true; };
  }, [data, layer, dem, point?.lat, point?.lng]);

  if (err) {
    return (
      <div className="rounded-xl border border-signal-amber/40 bg-signal-amber/10 p-4 text-[13px] text-signal-amber" style={{ minHeight: 140 }}>
        Apple Maps 3D is not available: {err}
        <div className="mt-1 text-ink-300">Switch to 3D blocks. It needs no key.</div>
      </div>
    );
  }
  return <div ref={ref} className="overflow-hidden rounded-xl border border-ink-700/60" style={{ height: 460 }} />;
}
