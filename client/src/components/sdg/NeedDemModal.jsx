import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import EmptyState from "./EmptyState";

// Blocks the whole app until the person goes to New Inputs. The only control inside is the button; there is no close and Escape does nothing.
export default function NeedDemModal({ onGo }) {
  const btn = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    btn.current?.focus();
    const keep = (e) => { if (e.key === "Tab" || e.key === "Escape") { e.preventDefault(); btn.current?.focus(); } };
    const stay = (e) => { if (e.target !== btn.current && !btn.current?.contains(e.target)) btn.current?.focus(); };
    document.addEventListener("keydown", keep, true); document.addEventListener("focusin", stay);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", keep, true); document.removeEventListener("focusin", stay); };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4" role="presentation" style={{ background: "rgba(8,12,18,0.78)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="need-dem-title" aria-describedby="need-dem-body" className="my-auto w-full max-w-xl">
        <EmptyState emoji="🛰️" title={<span id="need-dem-title">Run the DEM engine first</span>}
          actions={[{ label: "Go to New Inputs", primary: true, onClick: onGo, ref: btn }]}>
          <span id="need-dem-body">The SDG pages start from your own elevation result. Pick a place in New Inputs, run the DEM engine, then choose Continue to the SDG impact flow. It brings you back here with your result loaded.</span>
        </EmptyState>
      </div>
    </div>, document.body);
}
