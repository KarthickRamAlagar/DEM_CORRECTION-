export default function BandChart({ bands, className = "" }) {
  const w = 220;
  const h = 60;
  const max = 100;
  const barW = w / bands.length;

  const points = bands
    .map((b, i) => {
      const x = barW * i + barW / 2;
      const y = h - (b.value / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 60 }}>
        {bands.map((b, i) => {
          const barH = (b.value / max) * h;
          return (
            <rect
              key={b.name}
              x={barW * i + barW * 0.2}
              y={h - barH}
              width={barW * 0.6}
              height={barH}
              fill={b.color}
              opacity={0.5}
              rx={1.5}
            />
          );
        })}
        <polyline points={points} fill="none" stroke="#e7e9ee" strokeWidth="1.2" opacity={0.8} />
        {bands.map((b, i) => {
          const x = barW * i + barW / 2;
          const y = h - (b.value / max) * h;
          return <circle key={`${b.name}-dot`} cx={x} cy={y} r={2} fill={b.color} />;
        })}
      </svg>
      <div className="flex justify-between mt-1">
        {bands.map((b) => (
          <div key={b.name} className="text-center" style={{ width: `${100 / bands.length}%` }}>
            <div className="text-[10px] font-mono" style={{ color: b.color }}>
              {b.value}
            </div>
            <div className="text-[9px] text-ink-500">{b.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
