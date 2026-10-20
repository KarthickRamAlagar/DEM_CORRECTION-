import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { useSettings } from "../lib/useSettings";

// LEO altitudes (400-900km) are a tiny fraction of Earth's radius (6371km),
// so a true-to-scale point sits almost flush with the surface. We exaggerate
// altitude on screen so satellites are visually distinguishable from the
// ground track under them — this is a display choice, not the real ratio
// (the actual km altitude is still shown in the telemetry/mission panels).
const ALTITUDE_EXAGGERATION = 4;
const EARTH_RADIUS_KM = 6371;

export default function Globe3D({ satellites, selectedId, onSelect }) {
  const globeRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [userInteracted, setUserInteracted] = useState(false);
  const { animationsEnabled } = useSettings();
  // Settings > Appearance > Animations also controls the globe's idle spin
  const getAutoRotate = () => animationsEnabled && !userInteracted;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(width, 1), h: Math.max(height, 1) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || size.w === 0) return;
    g.pointOfView({ lat: 15, lng: 40, altitude: 2.3 }, 0);
    const controls = g.controls();
    if (controls) {
      controls.autoRotate = getAutoRotate();
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w > 0]);

  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (controls) controls.autoRotate = animationsEnabled && !userInteracted;
  }, [animationsEnabled, userInteracted]);

  const stopAutoRotate = () => {
    const controls = globeRef.current?.controls?.();
    if (controls) controls.autoRotate = false;
    setUserInteracted(true);
  };

  const points = useMemo(
    () =>
      satellites
        .filter((s) => s.position)
        .map((s) => ({
          id: s.id,
          lat: s.position.lat,
          lng: s.position.lon,
          color: s.color,
          size: s.id === selectedId ? 1.5 : 1,
          altitude: (s.position.altKm / EARTH_RADIUS_KM) * ALTITUDE_EXAGGERATION,
          label: `${s.short} · ${s.position.altKm.toFixed(0)} km`,
        })),
    [satellites, selectedId]
  );

  const paths = useMemo(
    () =>
      satellites.flatMap((s) =>
        s.track
          .filter((seg) => seg.length > 1)
          .map((seg, i) => ({
            id: `${s.id}-${i}`,
            satId: s.id,
            color: s.color,
            dimmed: selectedId ? s.id !== selectedId : false,
            coords: seg.map(([lon, lat]) => [lat, lon]),
          }))
      ),
    [satellites, selectedId]
  );

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 isolate globe-space"
      onPointerDown={stopAutoRotate}
      onWheel={stopAutoRotate}
    >
      {size.w > 0 && (
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          atmosphereColor="#5eead4"
          atmosphereAltitude={0.2}
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude="altitude"
          pointRadius="size"
          pointLabel="label"
          pointResolution={12}
          onPointClick={(p) => onSelect(p.id)}
          pathsData={paths}
          pathPoints="coords"
          pathPointLat={(p) => p[0]}
          pathPointLng={(p) => p[1]}
          pathColor={(d) => (d.dimmed ? `${d.color}66` : d.color)}
          pathStroke={(d) => (d.dimmed ? 0.4 : 0.9)}
          pathDashLength={0.4}
          pathDashGap={0.18}
          pathDashAnimateTime={9000}
          pathTransitionDuration={0}
        />
      )}

      {!userInteracted && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-mono text-ink-500 bg-ink-900/70 border border-ink-700/60 rounded-full px-3 py-1 pointer-events-none">
          Drag to rotate · scroll or pinch to zoom
        </div>
      )}
    </div>
  );
}
