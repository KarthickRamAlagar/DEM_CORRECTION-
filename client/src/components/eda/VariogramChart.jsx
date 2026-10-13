// Variogram - semivariance vs. distance, from /api/eda/variogram
// A LINE chart, not a scatter - this is already-binned/aggregated data
// (20 distance bins), each point representing an average over many
// real point-pairs (shown via dot size = number of pairs behind it).

export default function VariogramChart({ data, height = 220 }) {
  if (!data || !data.points || data.points.length === 0) return null;

  const points = data.points;
  const w = 600;
  const h = height;
  const padding = 40;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const distances = points.map((p) => p.distance_km);
  const semivariances = points.map((p) => p.semivariance);
  const maxPairs = Math.max(...points.map((p) => p.n_pairs));

  const xMin = 0, xMax = Math.max(...distances);
  const yMin = 0, yMax = Math.max(...semivariances) * 1.1;

  const scaleX = (v) => padding + (v / (xMax || 1)) * plotW;
  const scaleY = (v) => padding + plotH - (v / (yMax || 1)) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.distance_km)} ${scaleY(p.semivariance)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        <path d={linePath} fill="none" stroke="#5eead4" strokeWidth="1.5" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={scaleX(p.distance_km)}
            cy={scaleY(p.semivariance)}
            // dot size reflects how many real point-pairs support this bin -
            // bigger dot = more reliable estimate at that distance
            r={2 + (p.n_pairs / maxPairs) * 4}
            fill="#5eead4"
            opacity="0.8"
          />
        ))}

        <text x={w / 2} y={h - 4} fontSize="10" fill="#94a3b8" textAnchor="middle">Distance (km)</text>
        <text x={10} y={h / 2} fontSize="10" fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 10, ${h / 2})`}>
          Semivariance
        </text>
      </svg>

      <p className="text-[10px] text-ink-500 mt-1">
        Dot size = number of point-pairs behind that estimate (bigger = more reliable).
        Where the line flattens out is the distance beyond which points stop
        meaningfully influencing each other - useful for choosing a spatial
        cross-validation block size.
      </p>
    </div>
  );
}