export default function HistogramChart({ bins, color = "#60a5fa", height = 90 }) {
  if (!bins.length) return null;
  const w = 600;
  const h = height;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const barW = w / bins.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      {bins.map((b, i) => {
        const barH = (b.count / maxCount) * (h - 4);
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={h - barH}
            width={Math.max(barW - 2, 1)}
            height={barH}
            fill={color}
            opacity={0.55 + 0.35 * (b.count / maxCount)}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
