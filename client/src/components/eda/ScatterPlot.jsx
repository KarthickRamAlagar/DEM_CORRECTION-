// Scatter Plot - one feature's values against the target
// (elevation_error_signed), from the precomputed 5,000-point sample
// built in eda/compute_scatter_samples.py
//
// FIX: with 5,000 points, plain semi-transparent dots just show a
// blob - you can't tell dense regions from sparse ones. This bins
// points into a coarse grid FIRST, counts how many points share each
// bin, then colors each point by its local density (teal = sparse,
// bright amber = dense) - a real, informative density signal instead
// of a uniform color.

function computeDensityColors(pairs, gridSize = 30) {
  if (pairs.length === 0) return [];

  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const cellOf = (x, y) => {
    const col = Math.min(gridSize - 1, Math.floor(((x - xMin) / xSpan) * gridSize));
    const row = Math.min(gridSize - 1, Math.floor(((y - yMin) / ySpan) * gridSize));
    return `${row}_${col}`;
  };

  const counts = {};
  for (const [x, y] of pairs) {
    const key = cellOf(x, y);
    counts[key] = (counts[key] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(counts));

  // teal (low density) -> amber (high density), interpolated
  const lowColor = [94, 234, 212];   // #5eead4
  const highColor = [251, 191, 36];  // amber-400

  return pairs.map(([x, y]) => {
    const density = counts[cellOf(x, y)] / maxCount;
    const rgb = lowColor.map((c, i) => Math.round(c + (highColor[i] - c) * density));
    return { color: `rgb(${rgb.join(",")})`, opacity: 0.3 + density * 0.5 };
  });
}

export default function ScatterPlot({ xValues, yValues, xLabel, yLabel, correlation, height = 220 }) {
  if (!xValues || !yValues || xValues.length === 0) return null;

  const w = 600;
  const h = height;
  const padding = 40;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const pairs = xValues
    .map((x, i) => [x, yValues[i]])
    .filter(([x, y]) => x !== null && y !== null);

  if (pairs.length === 0) {
    return (
      <div className="flex items-center justify-center text-[11px] text-ink-500" style={{ height }}>
        No valid data points for this feature (likely a high-missing column).
      </div>
    );
  }

  const xVals = pairs.map((p) => p[0]);
  const yVals = pairs.map((p) => p[1]);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);

  const scaleX = (v) => padding + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (v) => padding + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const densityStyles = computeDensityColors(pairs);

  return (
    <div>
      {/* Metrics bar - the numbers that actually explain what the chart shows */}
      <div className="flex flex-wrap gap-4 text-[11px] mb-2 px-1">
        <span className="text-ink-400">
          Points plotted: <span className="text-ink-200 font-mono">{pairs.length.toLocaleString()}</span>
          {pairs.length < xValues.length && (
            <span className="text-ink-500"> (of {xValues.length.toLocaleString()} sampled, rest missing)</span>
          )}
        </span>
        {typeof correlation === "number" && (
          <span className="text-ink-400">
            Correlation with error:{" "}
            <span className={correlation >= 0 ? "text-signal-teal" : "text-signal-red"}>
              {correlation.toFixed(3)}
            </span>
          </span>
        )}
        <span className="text-ink-400">
          X range: <span className="text-ink-200 font-mono">{xMin.toFixed(2)} to {xMax.toFixed(2)}</span>
        </span>
        <span className="text-ink-400">
          Y range: <span className="text-ink-200 font-mono">{yMin.toFixed(2)} to {yMax.toFixed(2)}</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        {yMin < 0 && yMax > 0 && (
          <line x1={padding} y1={scaleY(0)} x2={w - padding} y2={scaleY(0)} stroke="#475569" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {pairs.map(([x, y], i) => (
          <circle
            key={i}
            cx={scaleX(x)}
            cy={scaleY(y)}
            r="2"
            fill={densityStyles[i].color}
            opacity={densityStyles[i].opacity}
          />
        ))}

        <text x={w / 2} y={h - 4} fontSize="10" fill="#94a3b8" textAnchor="middle">{xLabel}</text>
        <text x={10} y={h / 2} fontSize="10" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 10, ${h / 2})`}>{yLabel}</text>
      </svg>

      {/* density legend */}
      <div className="flex items-center gap-2 text-[10px] text-ink-500 justify-end">
        <span>Sparse</span>
        <div className="w-16 h-2 rounded" style={{ background: "linear-gradient(to right, #5eead4, #fbbf24)" }} />
        <span>Dense</span>
      </div>
    </div>
  );
}