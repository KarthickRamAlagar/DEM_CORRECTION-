import { ComposableMap, Geographies, Geography, Sphere, Graticule, Marker } from "react-simple-maps";
import { getSubpointRegion } from "../lib/geoRegions";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function trackToGeoJSON(satellites) {
  const features = [];
  satellites.forEach((sat) => {
    sat.track.forEach((segment, i) => {
      if (segment.length < 2) return;
      features.push({
        type: "Feature",
        properties: { color: sat.color, id: `${sat.id}-${i}`, satId: sat.id },
        geometry: { type: "LineString", coordinates: segment },
      });
    });
  });
  return { type: "FeatureCollection", features };
}

function SatelliteMarker({ sat, isSelected, dimmed, onSelect }) {
  if (!sat.position) return null;
  const { lat, lon } = sat.position;
  const r = isSelected ? 4.4 : 3.2;

  return (
    <Marker coordinates={[lon, lat]} onClick={() => onSelect(sat.id)} style={{ cursor: "pointer" }}>
      <g className="pulse-ring" style={{ transformOrigin: "center" }} opacity={dimmed ? 0.25 : 0.5}>
        <circle r={isSelected ? 10 : 7} fill="none" stroke={sat.color} strokeWidth={isSelected ? 0.9 : 0.6} />
      </g>
      <circle
        r={r}
        fill="#0c0e12"
        stroke={sat.color}
        strokeWidth={isSelected ? 1.8 : 1.2}
        opacity={dimmed ? 0.45 : 1}
      />
      {sat.heading != null && (
        <path
          d={isSelected ? "M 0 -7 L 3.5 -1.5 L -3.5 -1.5 Z" : "M 0 -6 L 3 -1 L -3 -1 Z"}
          fill={sat.color}
          opacity={dimmed ? 0.45 : 1}
          transform={`rotate(${sat.heading})`}
        />
      )}
      <text
        textAnchor="middle"
        y={isSelected ? -13 : -11}
        fill={sat.color}
        opacity={dimmed ? 0.5 : 1}
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: isSelected ? 8 : 7,
          fontWeight: 700,
        }}
      >
        {sat.short}
      </text>
    </Marker>
  );
}

export default function MapView({ satellites, selectedId, onSelect }) {
  const trackGeoJSON = trackToGeoJSON(satellites.filter((s) => s.track.length));

  const overIndia = satellites.find(
    (s) => s.position && getSubpointRegion(s.position.lat, s.position.lon) === "India"
  );

  return (
    <div className="relative isolate w-full h-full bg-ink-950 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-6 flex items-center px-6 justify-between text-[10px] font-mono text-ink-500 pointer-events-none z-10">
        <span>90°N</span>
        <span>0°</span>
        <span>0°</span>
        <span>90°S</span>
      </div>

      {overIndia && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-ink-900/95 border rounded-full px-3 py-1 text-[11px] font-medium shadow-panel"
          style={{ borderColor: overIndia.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: overIndia.color }} />
          <span style={{ color: overIndia.color }}>{overIndia.short}</span>
          <span className="text-ink-300">is over India right now</span>
        </div>
      )}

      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 175 }}
        width={800}
        height={520}
        style={{ width: "100%", height: "100%" }}
      >
        <Sphere id="sphere" fill="transparent" stroke="#1b1f27" strokeWidth={0.5} />
        <Graticule stroke="#161a21" strokeWidth={0.5} />

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#12151b"
                stroke="#242933"
                strokeWidth={0.6}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "#171b22" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {trackGeoJSON.features.length > 0 && (
          <Geographies geography={trackGeoJSON}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const isSelected = geo.properties.satId === selectedId;
                const dimmed = selectedId && !isSelected;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="none"
                    stroke={geo.properties.color}
                    strokeWidth={isSelected ? 1.6 : 1.1}
                    strokeOpacity={dimmed ? 0.3 : 0.85}
                    className="orbit-path"
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                  />
                );
              })
            }
          </Geographies>
        )}

        {satellites.map((sat) => (
          <SatelliteMarker
            key={sat.id}
            sat={sat}
            isSelected={sat.id === selectedId}
            dimmed={selectedId ? sat.id !== selectedId : false}
            onSelect={onSelect}
          />
        ))}
      </ComposableMap>
    </div>
  );
}
