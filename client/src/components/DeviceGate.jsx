import { useState, useEffect } from "react";
import { Monitor, Tablet } from "lucide-react";

// Device Gate - this application is designed for tablet/laptop/desktop
// use only, not phones. Below the tablet breakpoint (768px, matching
// Tailwind's "md" breakpoint), the real app never mounts at all -
// instead this blocking card shows, explaining why.
const TABLET_BREAKPOINT_PX = 768;

function useIsBelowTablet() {
  const [isBelowTablet, setIsBelowTablet] = useState(
    typeof window !== "undefined" ? window.innerWidth < TABLET_BREAKPOINT_PX : false
  );

  useEffect(() => {
    const check = () => setIsBelowTablet(window.innerWidth < TABLET_BREAKPOINT_PX);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isBelowTablet;
}

function TooSmallScreenCard() {
  return (
    <div className="fixed inset-0 bg-ink-950 flex items-center justify-center p-6 z-[9999]">
      <div className="max-w-sm w-full bg-ink-900/60 backdrop-blur-md border border-ink-700/60 rounded-2xl shadow-xl shadow-black/30 p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-5">
          <Tablet size={28} className="text-ink-500" />
          <span className="text-ink-600 text-xl">→</span>
          <Monitor size={32} className="text-signal-teal" />
        </div>
        <h2 className="font-display text-lg font-semibold text-white mb-2">
          Please Use a Larger Screen
        </h2>
        <p className="text-[13px] text-ink-400 leading-relaxed">
          AETHER GIS is built for tablet, laptop, and desktop use, where its maps,
          charts, and data panels have the space they need to be genuinely useful.
          Please reopen this page on a larger device.
        </p>
      </div>
    </div>
  );
}

export default function DeviceGate({ children }) {
  const isBelowTablet = useIsBelowTablet();

  if (isBelowTablet) {
    return <TooSmallScreenCard />;
  }

  return children;
}