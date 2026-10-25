import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Compass, Lock, Monitor, PlayCircle } from "lucide-react";
import { FLOW_STEPS } from "../../lib/flowSteps";
import { SdgChip } from "./Ui";

// One picture of the idea: the same water line on two elevation models. Invented shapes, labelled as a schematic.
function Schematic() {
  const reduce = useReducedMotion();
  const ground = "M0,320 L0,150 L34,154 L50,232 L96,232 L112,190 L200,184 L300,172 L400,160 L520,146 L520,320 Z";
  const correctedLine = "M0,150 L34,154 L50,232 L96,232 L112,190 L200,184 L300,172 L400,160 L520,146";
  const rawLine = "M112,164 L200,160 L300,155 L400,150 L520,140";
  const Key = ({ children, color, dash }) => (
    <span className="inline-flex items-center gap-2"><svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={color} strokeWidth="3" strokeDasharray={dash} /></svg>{children}</span>
  );
  return (
    <figure className="m-0 rounded-2xl border border-ink-700/60 bg-ink-900/50 p-4 sm:p-5">
      <svg viewBox="0 112 520 208" role="img" aria-labelledby="schem-t schem-d" className="h-auto w-full">
        <title id="schem-t">Schematic: one water line on two elevation models</title>
        <desc id="schem-d">A river channel and a floodplain. The raw model keeps the plain above the water line. The corrected model puts part of the plain below it. The stretch where they disagree is marked.</desc>
        <defs><clipPath id="above-ground"><path d="M0,0 L0,150 L34,154 L50,232 L96,232 L112,190 L200,184 L300,172 L400,160 L520,146 L520,0 Z" /></clipPath></defs>
        <g clipPath="url(#above-ground)">
          <motion.rect x="0" y="0" width="520" height="150" fill="#2563eb" opacity="0.7" initial={{ y: reduce ? 170 : 236 }} animate={{ y: 170 }} transition={{ duration: 2.6, delay: 0.5, ease: "easeOut" }} />
        </g>
        <path d={ground} fill="currentColor" fillOpacity="0.22" className="text-ink-300" />
        <line x1="0" y1="170" x2="520" y2="170" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={rawLine} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 5" />
        <path d={correctedLine} fill="none" stroke="#14b8a6" strokeWidth="3" />
        <g stroke="currentColor" className="text-ink-200" strokeWidth="1.5"><line x1="112" y1="262" x2="312" y2="262" /><line x1="112" y1="256" x2="112" y2="268" /><line x1="312" y1="256" x2="312" y2="268" /></g>
        <g fontSize="13" fill="currentColor" className="text-ink-100">
          <text x="212" y="286" textAnchor="middle">The two models disagree here</text>
          <text x="73" y="250" textAnchor="middle">River</text>
          <text x="12" y="132">Water line when the river rises, say 2 m</text>
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-100">
        <Key color="#f59e0b" dash="6 4">Raw model</Key><Key color="#14b8a6">Corrected model</Key><Key color="#2563eb" dash="4 3">Water line</Key>
      </div>
      <figcaption className="mt-2 text-[13px] leading-relaxed text-ink-300">Schematic with invented shapes, to explain the idea. It does not say which model is right, and it is not measured data.</figcaption>
    </figure>
  );
}

export default function FlowIntro({ onStart, onExplore }) {
  const [sel, setSel] = useState(0);
  const step = FLOW_STEPS[sel];
  const Detail = ({ s }) => (
    <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
      <div className="flex flex-wrap items-center gap-3"><h3 className="text-[17px] font-semibold text-white">{s.title}</h3><SdgChip goal={s.sdg} /></div>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-[13px] text-ink-300">What you see</dt><dd className="mt-1 text-[13px] leading-relaxed text-ink-100">{s.what}</dd></div>
        <div><dt className="text-[13px] text-ink-300">What you do</dt><dd className="mt-1 text-[13px] leading-relaxed text-ink-100">{s.you}</dd></div>
      </dl>
    </div>
  );
  return (
    <div className="mt-8">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
        <div>
          <h2 className="text-[30px] font-semibold leading-[1.12] tracking-tight text-white sm:text-[38px]">How much land, how many people, how much money, if the river rises?</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-100">
            Take one place from a corrected elevation to a recovery estimate in seven short pages. Raw and corrected elevation models are run side by side, so you can see what the correction changes.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={onStart} className="inline-flex items-center gap-2 rounded-lg border border-signal-teal/60 bg-signal-teal px-5 py-3 text-[13px] font-semibold text-ink-950 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-teal">
              <PlayCircle size={18} /> Start the guided flow <ArrowRight size={16} />
            </button>
            <button type="button" onClick={onExplore} className="inline-flex items-center gap-2 rounded-lg border border-ink-600 px-5 py-3 text-[13px] font-medium text-ink-100 hover:border-ink-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal">
              <Compass size={18} /> Explore whole regions
            </button>
          </div>
          <p className="mt-6 max-w-xl border-l-[3px] border-signal-teal/70 pl-3.5 text-[13px] leading-relaxed text-ink-200">
            A what-if from terrain height, not a forecast. An estimate for planning, not a release decision. India and the southern plains of Nepal.
          </p>
        </div>
        <Schematic />
      </div>

      <section className="mt-14" aria-labelledby="route-h">
        <h2 id="route-h" className="text-[20px] font-semibold text-white">The seven pages</h2>
        <p className="mt-1 text-[13px] text-ink-200">Select a page to see what it shows and what you do there.</p>
        <ol className="relative mt-6 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-7 lg:gap-3">
          <span aria-hidden className="absolute left-[7.14%] right-[7.14%] top-[32px] hidden h-px bg-ink-700 lg:block" />
          {FLOW_STEPS.map((s, i) => {
            const Icon = s.icon;
            const on = i === sel;
            return (
              <li key={s.id} className="relative">
                <button type="button" onClick={() => setSel(i)} aria-pressed={on} aria-controls="route-detail"
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal lg:flex-col lg:items-center lg:px-1 lg:text-center ${on ? "bg-ink-850/80" : "hover:bg-ink-850/50"}`}>
                  <span className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${on ? "border-signal-teal bg-signal-teal text-ink-950" : "border-ink-600 bg-ink-900 text-signal-teal"}`}><Icon size={19} /></span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] leading-snug ${on ? "font-semibold text-white" : "text-ink-100"}`}>{s.title}</span>
                    {s.sdg && <span className="mt-0.5 flex lg:justify-center"><SdgChip goal={s.sdg} /></span>}
                  </span>
                </button>
                {on && <div className="mt-2 lg:hidden"><Detail s={s} /></div>}
              </li>
            );
          })}
        </ol>
        <div id="route-detail" className="mt-4 hidden lg:block" aria-live="polite"><Detail s={step} /></div>
      </section>

      <section className="mt-12 grid gap-px overflow-hidden rounded-xl border border-ink-700/60 bg-ink-700/60 sm:grid-cols-3" aria-label="How it behaves">
        {[
          { Icon: Lock, t: "Inputs lock when you start", d: "The place and the river rise stay fixed for the run. You can go back to pages you have seen, and forward with Next." },
          { Icon: Compass, t: "Explore keeps nothing locked", d: "Regional tables and flood maps, for looking around without a single place." },
          { Icon: Monitor, t: "Built for desktop and laptop", d: "Use Chrome or Edge on a desktop or laptop. 3D runs in the browser. XR needs a WebXR headset and comes later." },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="bg-ink-950 p-5">
            <Icon size={18} className="text-signal-teal" aria-hidden />
            <h3 className="mt-3 text-[15px] font-semibold text-white">{t}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-200">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
