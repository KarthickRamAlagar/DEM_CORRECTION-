export default function ProfileLineChart({ seriesA, seriesB, colorA, colorB, height = 180 }) {
  const w = 600;
  const h = height;
  const padL = 34;
  const padB = 18;
  const padT = 8;

  const allVals = [...seriesA.map((p) => p.elevation), ...seriesB.map((p) => p.elevation)];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const maxDist = Math.max(
    seriesA[seriesA.length - 1]?.distKm ?? 1,
    seriesB[seriesB.length - 1]?.distKm ?? 1
  );

  const toXY = (p) => {
    const x = padL + (p.distKm / maxDist) * (w - padL - 8);
    const y = padT + (1 - (p.elevation - min) / range) * (h - padT - padB);
    return [x, y];
  };

  const pathFor = (series) => series.map((p) => toXY(p).join(",")).join(" ");

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + (range * i) / ticks);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      {yTicks.map((t, i) => {
        const y = padT + (1 - (t - min) / range) * (h - padT - padB);
        return (
          <g key={i}>
            <line x1={padL} x2={w - 4} y1={y} y2={y} stroke="#1b1f27" strokeWidth={1} />
            <text x={0} y={y + 3} fontSize={9} fill="#6b7688" fontFamily="IBM Plex Mono, monospace">
              {Math.round(t)}
            </text>
          </g>
        );
      })}

      <polyline points={pathFor(seriesA)} fill="none" stroke={colorA} strokeWidth={1.6} />
      <polyline points={pathFor(seriesB)} fill="none" stroke={colorB} strokeWidth={1.6} strokeDasharray="4 3" />
    </svg>
  );
}
