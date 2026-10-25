import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import SpinNumber from "./SpinNumber";
import { COUNTRY } from "./Flags";

const fmt = (v) => Math.round(v).toLocaleString("en-IN");

// The estimated need, announced on top of a blurred page. The close button only appears once the numbers have stopped.
export default function AmountReveal({ countries, totalInr, onClose }) {
  const [done, setDone] = useState(0);
  const need = Math.max(1, countries.length) * 2 + 2;       // number of spinners
  const finished = done >= need;
  const btn = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e) => { if (e.key === "Escape" && finished) onClose(); else if (e.key === "Tab" && !finished) e.preventDefault(); };
    document.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key, true); };
  }, [finished, onClose]);
  useEffect(() => { if (finished) btn.current?.focus(); }, [finished]);
  const bump = () => setDone((n) => n + 1);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4" role="presentation"
      style={{ background: "rgba(8,12,18,0.78)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="amt-title" className="my-auto w-full max-w-2xl rounded-3xl border border-signal-teal/40 bg-ink-900 p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="amt-title" className="text-[20px] font-semibold text-white">How much money is needed</h3>
            <p className="mt-1 text-[13px] text-ink-200">Estimated recovery need from flood exposure, run on the corrected elevation model.</p>
          </div>
          {finished && <button ref={btn} type="button" onClick={onClose} aria-label="Close" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-[13px] font-medium text-ink-100 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal"><X size={14} aria-hidden /> Close</button>}
        </div>
        <div className="mt-5 grid gap-4">
          {countries.map((x, i) => {
            const c = COUNTRY[x.iso] ?? COUNTRY.IND;
            return (
              <div key={x.iso} className="rounded-2xl border border-ink-700/70 bg-ink-950/50 p-4">
                <div className="flex items-center gap-3 text-[15px] font-semibold text-white"><c.Flag size={30} /> {c.name} <span className="text-[13px] font-normal text-ink-300">in {c.code}</span></div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[["From", x.need_min], ["To", x.need_max]].map(([k, v], j) => (
                    <div key={k}><dt className="text-[13px] text-ink-300">{k}</dt>
                      <dd className="mt-1 flex items-center gap-2 text-white"><span className="text-[26px] font-bold text-signal-teal" aria-hidden>{c.symbol}</span><SpinNumber text={fmt(v)} size={30} delay={i * 200 + j * 120} onDone={bump} /></dd></div>
                  ))}
                </dl>
              </div>
            );
          })}
          <div className="rounded-2xl border border-signal-teal/40 bg-signal-teal/10 p-4">
            <div className="flex items-center gap-3 text-[15px] font-semibold text-white"><COUNTRY.IND.Flag size={30} /> Total in Indian rupees</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-white">
              <span className="text-[26px] font-bold text-signal-teal" aria-hidden>₹</span><SpinNumber text={fmt(totalInr.min)} size={30} delay={500} onDone={bump} />
              <span className="text-ink-300">to</span>
              <span className="text-[26px] font-bold text-signal-teal" aria-hidden>₹</span><SpinNumber text={fmt(totalInr.max)} size={30} delay={620} onDone={bump} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-ink-300">An estimate for planning, not a release decision and not a forecast. Nepal is converted at 1 INR = 1.60 NPR.</p>
      </div>
    </div>, document.body);
}
