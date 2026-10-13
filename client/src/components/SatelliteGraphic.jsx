export default function SatelliteGraphic({ className = "" }) {
  return (
    <svg
      viewBox="0 0 220 160"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* left solar panel */}
      <g stroke="#4c5566" strokeWidth="1">
        <rect x="6" y="52" width="58" height="34" rx="2" fill="#0f1319" stroke="#333a47" />
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={i} x1={6 + (i + 1) * 9.6} y1="52" x2={6 + (i + 1) * 9.6} y2="86" stroke="#242933" />
        ))}
        <line x1="64" y1="69" x2="86" y2="69" stroke="#5eead4" strokeWidth="1.5" />
      </g>

      {/* right solar panel */}
      <g stroke="#4c5566" strokeWidth="1">
        <rect x="156" y="30" width="58" height="34" rx="2" fill="#0f1319" stroke="#333a47" transform="rotate(8 185 47)" />
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={i}
            x1={156 + (i + 1) * 9.6}
            y1="30"
            x2={156 + (i + 1) * 9.6}
            y2="64"
            stroke="#242933"
            transform="rotate(8 185 47)"
          />
        ))}
        <line x1="134" y1="60" x2="156" y2="52" stroke="#5eead4" strokeWidth="1.5" />
      </g>

      {/* body */}
      <rect x="86" y="56" width="48" height="40" rx="6" fill="#161a21" stroke="#4c5566" strokeWidth="1.5" />
      <rect x="94" y="64" width="14" height="10" rx="1.5" fill="#1b1f27" stroke="#333a47" />
      <rect x="112" y="64" width="14" height="10" rx="1.5" fill="#1b1f27" stroke="#333a47" />
      <circle cx="101" cy="86" r="4" fill="#0f1319" stroke="#d9c48a" strokeWidth="1.2" />

      {/* antenna dish */}
      <g transform="translate(150 96)">
        <path d="M0 0 C 18 -4, 34 6, 36 26" stroke="#4c5566" strokeWidth="1.5" fill="none" />
        <ellipse cx="40" cy="30" rx="16" ry="11" fill="#161a21" stroke="#4c5566" strokeWidth="1.5" transform="rotate(-18 40 30)" />
        <circle cx="40" cy="30" r="2.4" fill="#5eead4" />
      </g>

      {/* boom + sensor left */}
      <path d="M86 78 C 66 78, 52 84, 40 98" stroke="#4c5566" strokeWidth="1.5" fill="none" />
      <circle cx="36" cy="102" r="10" fill="#161a21" stroke="#4c5566" strokeWidth="1.5" />
      <circle cx="36" cy="102" r="4" fill="#0f1319" stroke="#d9c48a" strokeWidth="1.2" />

      {/* status pulse */}
      <circle cx="101" cy="86" r="4" fill="none" stroke="#5eead4" strokeWidth="1" className="pulse-ring" style={{ transformOrigin: "101px 86px" }} />
    </svg>
  );
}
