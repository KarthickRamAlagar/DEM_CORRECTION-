// Small flags drawn as SVG (emoji flags do not show on Windows).
export function IndiaFlag({ size = 28, className = "" }) {
  const h = (size * 2) / 3;
  return (
    <svg width={size} height={h} viewBox="0 0 30 20" role="img" aria-label="India flag" className={className} style={{ borderRadius: 3, boxShadow: "0 0 0 1px rgba(0,0,0,.18)" }}>
      <rect width="30" height="7" fill="#FF9933" /><rect y="7" width="30" height="6" fill="#fff" /><rect y="13" width="30" height="7" fill="#138808" />
      <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth=".5" />
      {Array.from({ length: 12 }).map((_, i) => { const a = (i * Math.PI) / 6; return <line key={i} x1={15} y1={10} x2={15 + 2.6 * Math.cos(a)} y2={10 + 2.6 * Math.sin(a)} stroke="#000080" strokeWidth=".25" />; })}
    </svg>
  );
}
export function NepalFlag({ size = 28, className = "" }) {
  const h = size * 1.2;
  return (
    <svg width={size * 0.8} height={h * 0.8} viewBox="0 0 24 29" role="img" aria-label="Nepal flag" className={className}>
      <path d="M1 1 L23 14 H11 L23 28 H1 Z" fill="#DC143C" stroke="#003893" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6.2" cy="9.2" r="1.7" fill="#fff" /><circle cx="6" cy="21.2" r="2.6" fill="#fff" />
    </svg>
  );
}
export const COUNTRY = {
  IND: { name: "India", symbol: "₹", code: "INR", Flag: IndiaFlag },
  NPL: { name: "Nepal", symbol: "रू", code: "NPR", Flag: NepalFlag },
};
