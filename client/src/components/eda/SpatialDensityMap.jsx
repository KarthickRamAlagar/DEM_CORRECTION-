import { MapContainer, TileLayer, Rectangle, Polygon, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DARK_BASEMAP_URL, DARK_BASEMAP_ATTRIBUTION } from "../ImageryOverlayLayer";

// Spatial Density Map - renders precomputed grid or hexbin cells,
// colored by whichever value column is selected. Handles BOTH
// /api/eda/spatial/grid and /api/eda/spatial/hexbin, since they're the
// same underlying idea (aggregate points into cells, color by average
// value) just with different cell shapes.

function colorScale(value, min, max) {
  if (value === null || value === undefined) return "#334155"; // no data in this cell
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  // blue (low) -> teal -> amber (high) - a simple 3-stop gradient
  if (t < 0.5) {
    const s = t * 2;
    return `rgb(${Math.round(96 + (94 - 96) * s)}, ${Math.round(165 + (234 - 165) * s)}, ${Math.round(250 + (212 - 250) * s)})`;
  }
  const s = (t - 0.5) * 2;
  return `rgb(${Math.round(94 + (251 - 94) * s)}, ${Math.round(234 + (191 - 234) * s)}, ${Math.round(212 + (36 - 212) * s)})`;
}

const VALUE_COLUMN_LABELS = {
  raw_z: "Raw Elevation",
  elevation_error_signed: "Elevation Error",
  ndvi: "NDVI",
  slope_deg: "Slope",
};

function hexVertices(lonCenter, latCenter, radiusDeg) {
  // Standard pointy-top hexagon, 6 vertices around the center
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    vertices.push([
      latCenter + radiusDeg * Math.sin(angle),
      lonCenter + radiusDeg * Math.cos(angle),
    ]);
  }
  return vertices;
}

function CellTooltipContent({ valueColumn, value, pointCount, swatchColor }) {
  // FIX: was a single plain text string in Leaflet's default white
  // tooltip box. Restyled to match the app's dark glass-panel look
  // (see the .eda-tooltip CSS override in index.css), with labeled
  // rows similar in spirit to the Spatial Inspector panel, plus a
  // small color swatch tying the tooltip visually to the cell it
  // belongs to.
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: swatchColor }} />
        <span className="text-signal-teal font-semibold">
          {VALUE_COLUMN_LABELS[valueColumn] ?? valueColumn}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-ink-400">Value</span>
        <span className="text-ink-100">{value !== null ? value.toFixed(3) : "No data"}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-ink-400">Points in cell</span>
        <span className="text-ink-100">{pointCount.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function SpatialDensityMap({
  data,
  mode = "grid", // "grid" or "hexbin"
  valueColumn = "raw_z",
  center = [26.5, 82],
  height = 380,
}) {
  if (!data || !data.cells || data.cells.length === 0) {
    return (
      <div className="flex items-center justify-center text-[11px] text-ink-500" style={{ height }}>
        No spatial data available.
      </div>
    );
  }

  const valueKey = `${valueColumn}_mean`;
  const values = data.cells.map((c) => c[valueKey]).filter((v) => v !== null);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);

  const cellSize = mode === "grid" ? data.cell_size_deg : data.hex_radius_deg;

  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={7} style={{ height: "100%", width: "100%", background: "#0f172a" }}>
        <TileLayer url={DARK_BASEMAP_URL} attribution={DARK_BASEMAP_ATTRIBUTION} />

        {data.cells.map((cell, i) => {
          const value = cell[valueKey];
          const fillColor = colorScale(value, vMin, vMax);

          const tooltipContent = (
            <CellTooltipContent
              valueColumn={valueColumn}
              value={value}
              pointCount={cell.point_count}
              swatchColor={fillColor}
            />
          );

          if (mode === "grid") {
            const bounds = [
              [cell.lat_center - cellSize / 2, cell.lon_center - cellSize / 2],
              [cell.lat_center + cellSize / 2, cell.lon_center + cellSize / 2],
            ];
            return (
              <Rectangle key={i} bounds={bounds} pathOptions={{ fillColor, fillOpacity: 0.65, weight: 0.5, color: "#1e293b" }}>
                <Tooltip className="eda-tooltip">{tooltipContent}</Tooltip>
              </Rectangle>
            );
          }

          const vertices = hexVertices(cell.lon_center, cell.lat_center, cellSize);
          return (
            <Polygon key={i} positions={vertices} pathOptions={{ fillColor, fillOpacity: 0.65, weight: 0.5, color: "#1e293b" }}>
              <Tooltip className="eda-tooltip">{tooltipContent}</Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}