// Moran's Scatter Plot - compares each point's own value against the
// average of its nearest neighbors, colored by LISA quadrant
// (High-High, Low-High, High-Low, Low-Low) - from
// /api/eda/spatial/morans-scatter

const QUADRANT_COLORS = {
  "High-High": "#5eead4",  // hotspot - similar high values clustering together
  "Low-Low": "#60a5fa",    // coldspot - similar low values clustering together
  "High-Low": "#f2545b",   // spatial outlier - high value surrounded by low
  "Low-High": "#fbbf24",   // spatial outlier - low value surrounded by high
};

export default function MoransScatterPlot({ data, height = 260 }) {
  if (!data || !data.x_own_value) return null;

  const { x_own_value, y_neighbor_average, quadrant } = data;
  const w = 600;
  const h = height;
  const padding = 40;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const allX = x_own_value;
  const allY = y_neighbor_average;
  const xMin = Math.min(...allX), xMax = Math.max(...allX);
  const yMin = Math.min(...allY), yMax = Math.max(...allY);

  const scaleX = (v) => padding + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (v) => padding + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const counts = { "High-High": 0, "Low-Low": 0, "High-Low": 0, "Low-High": 0 };
  quadrant.forEach((q) => { counts[q] = (counts[q] || 0) + 1; });
  const total = quadrant.length;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        {/* quadrant divider lines at x=0 and y=0 */}
        {xMin < 0 && xMax > 0 && (
          <line x1={scaleX(0)} y1={padding} x2={scaleX(0)} y2={h - padding} stroke="#475569" strokeWidth="1" strokeDasharray="3,3" />
        )}
        {yMin < 0 && yMax > 0 && (
          <line x1={padding} y1={scaleY(0)} x2={w - padding} y2={scaleY(0)} stroke="#475569" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {allX.map((x, i) => (
          <circle
            key={i}
            cx={scaleX(x)}
            cy={scaleY(allY[i])}
            r="2"
            fill={QUADRANT_COLORS[quadrant[i]] || "#94a3b8"}
            opacity="0.45"
          />
        ))}

        <text x={w / 2} y={h - 4} fontSize="10" fill="#94a3b8" textAnchor="middle">
          This Point's Value (centered on the average)
        </text>
        <text x={10} y={h / 2} fontSize="10" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 10, ${h / 2})`}>
          Neighbors' Average Value
        </text>
      </svg>

      {/* Quadrant legend with real counts - tells you how clustered vs. scattered the terrain error actually is */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        {Object.entries(QUADRANT_COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-ink-400">{label}:</span>
            <span className="text-ink-200 font-mono">
              {counts[label]} ({((counts[label] / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink-500 mt-2">
        High-High and Low-Low mean this point's value matches its neighbors (real spatial clustering).
        High-Low and Low-High mean this point stands out from its surroundings (a spatial anomaly).
      </p>
    </div>
  );
}