import { useEffect, useRef, useState } from "react";

// Slot-machine digits: every digit rolls through 0 to 9 a few times and then stops on its value, left to right.
export default function SpinNumber({ text, onDone, size = 34, delay = 0 }) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const [go, setGo] = useState(!!reduce);
  const done = useRef(false);
  const chars = String(text).split("");
  const last = Math.max(0, chars.map((c, i) => (/\d/.test(c) ? i : -1)).reduce((a, b) => Math.max(a, b), -1));
  useEffect(() => {
    if (reduce) { if (!done.current) { done.current = true; onDone?.(); } return undefined; }
    const t1 = setTimeout(() => setGo(true), 60 + delay);
    const total = 1500 + last * 120 + 250 + delay;
    const t2 = setTimeout(() => { if (!done.current) { done.current = true; onDone?.(); } }, total);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="inline-flex items-center font-mono font-bold tabular-nums" style={{ fontSize: size, lineHeight: 1 }} aria-label={String(text)} role="text">
      {chars.map((c, i) => {
        if (!/\d/.test(c)) return <span key={i} aria-hidden style={{ height: size, lineHeight: `${size}px` }}>{c}</span>;
        const d = Number(c);
        return (
          <span key={i} aria-hidden className="inline-block overflow-hidden" style={{ height: size, width: size * 0.62 }}>
            <span className="block" style={{ transform: `translateY(${go ? -(20 + d) * size : 0}px)`, transition: go ? `transform ${1500 + i * 120}ms cubic-bezier(.12,.7,.18,1)` : "none" }}>
              {Array.from({ length: 30 }).map((_, k) => <span key={k} className="block text-center" style={{ height: size, lineHeight: `${size}px` }}>{k % 10}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
