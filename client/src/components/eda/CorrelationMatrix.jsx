import { useRef, useState, useLayoutEffect } from "react";

// Correlation Matrix
//
// FIX HISTORY:
// 1. Was an HTML <table> - auto-sized columns to fit widest header
//    text, causing uneven cell spacing. Fixed with CSS Grid + fixed
//    column widths.
// 2. Legend used CSS flexbox `items-stretch` + `h-full` to try to
//    match the matrix's height - this is a known CSS edge case where
//    percentage heights (h-full) don't reliably resolve against a
//    flex-stretched (not explicitly-sized) parent. Confirmed broken
//    in the actual rendered output. FIXED HERE by measuring the
//    matrix's real rendered height in JS (via ref + ResizeObserver)
//    and applying that exact pixel height directly to the legend -
//    this works regardless of any CSS flexbox quirks, since it's not
//    relying on percentage-height resolution at all.

function cellColor(v) {
  if (v >= 0) {
    const alpha = 0.12 + v * 0.55;
    return `rgba(94, 234, 212, ${alpha})`;
  }
  const alpha = 0.12 + -v * 0.55;
  return `rgba(242, 84, 91, ${alpha})`;
}

function CorrelationLegend({ heightPx }) {
  const steps = [1, 0.8, 0.6, 0.4, 0.2, 0, -0.2, -0.4, -0.6, -0.8, -1];

  return (
    <div
      className="flex flex-col justify-between items-center shrink-0"
      style={{ height: heightPx ? `${heightPx}px` : "auto" }}
    >
      <span className="text-[10px] text-ink-500">Strong</span>
      <div className="flex flex-col justify-between py-1 w-full" style={{ flex: 1 }}>
        {steps.map((v) => (
          <div key={v} className="flex items-center gap-1.5 justify-center">
            <div className="w-6 h-4 rounded-sm shrink-0" style={{ backgroundColor: cellColor(v) }} />
            <span className="text-[9px] text-ink-500 font-mono w-8">{v.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <span className="text-[10px] text-ink-500">Strong</span>
    </div>
  );
}

export default function CorrelationMatrix({ columns, matrix }) {
  const n = columns.length;
  const cellSize = 56;
  const labelColWidth = 140;

  const matrixRef = useRef(null);
  const [matrixHeight, setMatrixHeight] = useState(null);

  // Measure the matrix's real rendered height, and keep it in sync if
  // the matrix changes size (e.g. switching to a group with a
  // different number of features/rows)
  useLayoutEffect(() => {
    if (!matrixRef.current) return;

    const measure = () => setMatrixHeight(matrixRef.current.offsetHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(matrixRef.current);
    return () => observer.disconnect();
  }, [columns, matrix]);

  return (
    <div className="flex items-start justify-center gap-6 w-full">
      <div className="overflow-x-auto" ref={matrixRef}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${labelColWidth}px repeat(${n}, ${cellSize}px)`,
          }}
        >
          <div />
          {columns.map((c) => (
            <div
              key={c}
              className="text-[11px] text-ink-400 flex items-end justify-center pb-2 overflow-hidden"
              style={{ height: 90 }}
              title={c}
            >
              <span
                className="whitespace-nowrap"
                style={{ transform: "rotate(-45deg) translateX(8px)", transformOrigin: "bottom left" }}
              >
                {c}
              </span>
            </div>
          ))}

          {matrix.map((row, i) => (
            <div key={columns[i]} style={{ display: "contents" }}>
              <div className="text-[12px] text-ink-400 flex items-center pr-2 truncate" title={columns[i]}>
                {columns[i]}
              </div>
              {row.map((v, j) => (
                <div key={j} className="p-1 flex items-center justify-center">
                  <div
                    className="w-full h-9 flex items-center justify-center rounded font-mono text-[12px] text-ink-100"
                    style={{ backgroundColor: cellColor(v) }}
                    title={`${columns[i]} x ${columns[j]}: ${v}`}
                  >
                    {v.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <CorrelationLegend heightPx={matrixHeight} />
    </div>
  );
}