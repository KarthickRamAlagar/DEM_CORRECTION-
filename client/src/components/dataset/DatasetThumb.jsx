const TYPE_GRADIENT = {
  "Point Cloud": "from-signal-teal/25 via-ink-800 to-ink-900",
  Raster: "from-signal-sky/25 via-ink-800 to-ink-900",
  Vector: "from-signal-violet/25 via-ink-800 to-ink-900",
  DEM: "from-signal-gold/25 via-ink-800 to-ink-900",
};

// A light abstract pattern per type so cards are visually distinct without
// pretending to be real satellite imagery.
function TypePattern({ type }) {
  if (type === "Point Cloud") {
    return (
      <svg viewBox="0 0 100 64" className="absolute inset-0 w-full h-full opacity-40">
        {Array.from({ length: 40 }).map((_, i) => (
          <circle
            key={i}
            cx={(i * 37) % 100}
            cy={((i * 53) % 64) + ((i % 5) - 2)}
            r={0.6 + (i % 3) * 0.3}
            fill="currentColor"
          />
        ))}
      </svg>
    );
  }
  if (type === "DEM") {
    return (
      <svg viewBox="0 0 100 64" className="absolute inset-0 w-full h-full opacity-40">
        {[10, 22, 34, 46, 58].map((y, i) => (
          <path
            key={i}
            d={`M0 ${y} Q 25 ${y - 8 - i * 2} 50 ${y} T 100 ${y}`}
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        ))}
      </svg>
    );
  }
  if (type === "Vector") {
    return (
      <svg viewBox="0 0 100 64" className="absolute inset-0 w-full h-full opacity-40">
        <polygon points="20,10 55,18 48,45 15,40" fill="none" stroke="currentColor" strokeWidth="1" />
        <polygon points="55,25 85,15 90,50 60,55" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  // Raster: a coarse grid, evoking tiled imagery
  return (
    <svg viewBox="0 0 100 64" className="absolute inset-0 w-full h-full opacity-30">
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 8 }).map((_, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * 12.5}
            y={r * 12.8}
            width={12.5}
            height={12.8}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        ))
      )}
    </svg>
  );
}

export default function DatasetThumb({ type, className = "" }) {
  const gradient = TYPE_GRADIENT[type] ?? TYPE_GRADIENT.Raster;
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-ink-700/60 bg-gradient-to-br ${gradient} text-ink-400 ${className}`}
    >
      <TypePattern type={type} />
    </div>
  );
}
