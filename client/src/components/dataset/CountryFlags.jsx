// Small inline SVG flags (Windows does not draw emoji flags, so these are drawn here).
// The Nepal flag is a simplified drawing of the double-pennant shape.

export function IndiaFlag({ className = "" }) {
  return (
    <svg viewBox="0 0 30 20" className={className} role="img" aria-label="Flag of India">
      <rect width="30" height="6.67" fill="#FF9933" />
      <rect y="6.67" width="30" height="6.66" fill="#FFFFFF" />
      <rect y="13.33" width="30" height="6.67" fill="#138808" />
      <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.5" />
      <g stroke="#000080" strokeWidth="0.25">
        {[0, 30, 60, 90, 120, 150].map((a) => (
          <line key={a} x1="15" y1="7.4" x2="15" y2="12.6" transform={`rotate(${a} 15 10)`} />
        ))}
      </g>
      <circle cx="15" cy="10" r="0.45" fill="#000080" />
    </svg>
  );
}

export function NepalFlag({ className = "" }) {
  return (
    <svg viewBox="0 0 24 30" className={className} role="img" aria-label="Flag of Nepal">
      <path d="M1.5 1 L21.5 14 H9.5 L21.5 29 H1.5 Z" fill="#DC143C" stroke="#003893" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6" cy="10" r="2" fill="#FFFFFF" />
      <circle cx="6" cy="22" r="2.4" fill="#FFFFFF" />
    </svg>
  );
}
