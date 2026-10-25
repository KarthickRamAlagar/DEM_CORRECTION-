import { useEffect, useRef, useState } from "react";
import { mapkitTokenUrl } from "../../lib/sdgApi";

const SCRIPT = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";

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

// Apple Maps basemap. The private key stays on the server (.env); the browser only receives a short-lived token.
export default function AppleMapView({ point, radiusKm }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const probe = await fetch(mapkitTokenUrl(window.location.origin));
        if (!probe.ok) throw new Error((await probe.json().catch(() => ({}))).detail || `Token request failed (${probe.status})`);
        const mapkit = await loadMapKit();
        if (dead) return;
        if (!mapRef.current) {
          mapkit.init({
            authorizationCallback: (done) => fetch(mapkitTokenUrl(window.location.origin)).then((r) => r.json()).then((j) => done(j.token)).catch(() => setErr("Apple token refresh failed")),
          });
          mapRef.current = new mapkit.Map(ref.current, { mapType: mapkit.Map.MapTypes.Hybrid, showsMapTypeControl: true });
        }
        const m = mapRef.current;
        m.removeOverlays(m.overlays); m.removeAnnotations(m.annotations);
        const c = new mapkit.Coordinate(point.lat, point.lng);
        const span = (radiusKm * 2.6) / 111.195;
        m.region = new mapkit.CoordinateRegion(c, new mapkit.CoordinateSpan(span, span));
        m.addOverlay(new mapkit.CircleOverlay(c, radiusKm * 1000, { style: new mapkit.Style({ lineWidth: 2, strokeColor: "#facc15", fillOpacity: 0.12, fillColor: "#2563eb" }) }));
        m.addAnnotation(new mapkit.MarkerAnnotation(c, { title: "Selected place", color: "#facc15" }));
      } catch (e) {
        if (!dead) setErr(String(e.message || e));
      }
    })();
    return () => { dead = true; };
  }, [point?.lat, point?.lng, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) {
    return (
      <div className="rounded-xl border border-signal-amber/40 bg-signal-amber/10 p-4 text-[13px] text-signal-amber" style={{ minHeight: 140 }}>
        Apple Maps is not available yet: {err}
        <div className="mt-1 text-ink-300">Add APPLE_MAPKIT_TEAM_ID, APPLE_MAPKIT_KEY_ID and APPLE_MAPKIT_PRIVATE_KEY_PATH to .env, install PyJWT (uv add pyjwt cryptography) and restart the server. The 2D map works without it.</div>
      </div>
    );
  }
  return <div ref={ref} className="rounded-xl overflow-hidden border border-ink-700/70" style={{ height: 380 }} />;
}
