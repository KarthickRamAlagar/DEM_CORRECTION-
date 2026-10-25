import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Wheat, Box, Apple } from "lucide-react";
import { fetchScene, mapkitTokenUrl, fmtInt, NO_DATA } from "../../lib/sdgApi";
import { LEGEND, peopleUnit } from "../../lib/sceneWorld";
import { Segmented, DataTable } from "./Ui";
import EmptyState from "./EmptyState";
import Scene3D, { useDeviceModes } from "./Scene3D";
import AppleScene from "./AppleScene";

const RADII = [{ id: 1, label: "1 km" }, { id: 2, label: "2 km" }, { id: 3, label: "3 km" }];
const LAYERS = [{ id: "buildings", label: "Buildings" }, { id: "people", label: "People" }, { id: "crops", label: "Crops" }];
const DEMS = [{ id: "compare", label: "Compare" }, { id: "raw", label: "Raw DEM" }, { id: "corrected", label: "Corrected DEM" }];
const ENGINES = [{ id: "blocks", label: "3D blocks" }, { id: "apple", label: "Apple Maps 3D" }];
const ICON = { buildings: Building2, people: Users, crops: Wheat };

export default function View3D({ point, rise, defaultLayer = "buildings", seedRadius = 2 }) {
  const modes = useDeviceModes();
  const [layer, setLayer] = useState(defaultLayer);
  const [dem, setDem] = useState("compare");
  const [engine, setEngine] = useState("blocks");
  const [radius, setRadius] = useState(Math.min(3, Math.max(1, seedRadius)));
  const [exag, setExag] = useState(6);
  const [heightM, setHeightM] = useState(10);
  const [xrMsg, setXrMsg] = useState(null);
  const [apple, setApple] = useState({ ok: null, why: "Checking Apple credentials..." });

  useEffect(() => {
    let dead = false;
    fetch(mapkitTokenUrl(window.location.origin)).then(async (r) => {
      if (dead) return;
      if (r.ok) setApple({ ok: true });
      else setApple({ ok: false, why: (await r.json().catch(() => ({}))).detail || "Apple Maps is not configured on the server yet." });
    }).catch(() => !dead && setApple({ ok: false, why: "The server did not answer." }));
    return () => { dead = true; };
  }, []);

  const q = useQuery({
    queryKey: ["scene3d", point?.lat, point?.lng, radius, rise],
    queryFn: () => fetchScene({ lat: point.lat, lon: point.lng, radius_km: radius, rise_m: rise }),
    enabled: !!point, retry: 0, staleTime: 5 * 60 * 1000,
  });
  const d = q.data;
  const tot = d?.totals;
  const Ico = ICON[layer];
  const rows = tot ? [
    { k: "Buildings", ...pick(tot.buildings, (x) => x, fmtInt) },
    { k: "People", ...pick(tot.cells, (x) => x.people, fmtInt) },
    { k: "Cropland (ha)", ...pick(tot.cells, (x) => x.crop_ha, (v) => fmtInt(v)) },
  ] : [];
  const legend = LEGEND[dem];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Segmented label="Show" options={LAYERS} value={layer} onChange={setLayer} />
        <Segmented label="Elevation model" options={DEMS} value={dem} onChange={setDem} />
        <div className="flex items-center gap-2 text-[13px] text-ink-100">Radius <Segmented label="Radius" options={RADII} value={radius} onChange={setRadius} /></div>
        <div role="group" aria-label="Map engine" className="inline-flex rounded-lg bg-ink-800/80 p-1">
          {ENGINES.map((e) => {
            const off = e.id === "apple" && apple.ok !== true;
            return (
              <button key={e.id} type="button" aria-pressed={engine === e.id} disabled={off} title={off ? apple.why : undefined} onClick={() => setEngine(e.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-teal disabled:cursor-not-allowed disabled:opacity-45 ${engine === e.id ? "bg-ink-600 text-white shadow-sm" : "text-ink-200 hover:text-white"}`}>
                {e.id === "apple" ? <Apple size={13} aria-hidden /> : <Box size={13} aria-hidden />}{e.label}
              </button>
            );
          })}
        </div>
      </div>
      {apple.ok === false && <p className="mt-2 text-[13px] text-ink-300">Apple Maps 3D switches on when the Apple credentials are added to the server: {apple.why}</p>}

      <div className="mt-4">
        {q.isLoading && <p className="text-[13px] text-ink-300">Building the 3D scene...</p>}
        {q.isError && (
          <EmptyState compact emoji="🧭" title="The 3D view is not available here" detail={q.error.message}>
            It needs the river-height layer and the elevation files. Nothing is guessed.
          </EmptyState>
        )}
        {d && (
          <>
            {engine === "blocks"
              ? <Scene3D data={d} layer={layer} dem={dem} exag={exag} heightM={heightM} modes={modes} onStatus={setXrMsg} />
              : <AppleScene data={d} layer={layer} dem={dem} point={point} />}
            {xrMsg && <p className="mt-2 text-[13px] text-signal-amber">{xrMsg}</p>}
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 text-[13px] text-ink-100">
              {engine === "blocks" && <label className="flex items-center gap-3">Terrain height <input type="range" min="1" max="20" step="1" value={exag} onChange={(e) => setExag(Number(e.target.value))} /> <span className="tabular-nums text-white">{exag}x</span></label>}
              {engine === "blocks" && layer === "buildings" && <label className="flex items-center gap-3">Block height (illustration) <input type="range" min="4" max="40" step="2" value={heightM} onChange={(e) => setHeightM(Number(e.target.value))} /> <span className="tabular-nums text-white">{heightM} m</span></label>}
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0">
                {legend.filter(([t]) => layer === "buildings" || t !== "Not under water").map(([t0, c0]) => { const t = layer === "buildings" && t0 === "Not under water" ? "Building, not under water" : t0; const c = layer === "buildings" && t0 === "Not under water" ? "#e9e5dc" : c0; return [t, c]; }).map(([t, c]) => <li key={t} className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />{t}</li>)}
                {layer !== "buildings" && <li className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: layer === "crops" ? "#4ade80" : "#f2ece1" }} />{layer === "crops" ? "Cropland, not under water" : "People, not under water"}</li>}
              </ul>
            </div>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-300">
              {layer === "buildings" && "Each block is one mapped building footprint, drawn 1.5 times larger so it can be seen. Real heights are not in the data, so every block uses the same illustrative height."}
              {layer === "people" && `Each small figure stands for about ${fmtInt(peopleUnit(d))} people (WorldPop 2020, modelled). A 90 m cell with more people gets more figures, up to 10. Figures are drawn larger than life so they can be seen.`}
              {layer === "crops" && "Each striped tile is one 90 m field cell. A deeper green means more of the cell is cropland (ESA WorldCover 2021)."}
              {" "}Under water means the cell or building sits at or below the chosen river rise above the nearest river. Exposure only, not damage, not a forecast.
            </p>
            <h4 className="mb-2 mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-white"><Ico size={15} aria-hidden /> What the two elevation models say, inside {radius} km</h4>
            <DataTable caption="Raw against corrected DEM inside the 3D circle" rows={rows} rowKey={(r) => r.k}
              columns={[{ key: "k", label: "Under water", render: (r) => r.k }, { key: "r", label: "Raw DEM", align: "right", render: (r) => r.raw }, { key: "c", label: "Corrected DEM", align: "right", render: (r) => r.corrected }, { key: "co", label: "Only corrected", align: "right", render: (r) => r.co }, { key: "ro", label: "Only raw", align: "right", render: (r) => r.ro }, { key: "a", label: "All inside", align: "right", render: (r) => r.all }]} />
            {d.notes.map((n) => <p key={n} className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-300">{n}</p>)}
          </>
        )}
      </div>
    </div>
  );
}

function pick(t, get, f) {
  const v = (k) => (t?.[k] == null ? NO_DATA : f(get(t[k])));
  return { raw: v("raw"), corrected: v("corrected"), co: v("corrected_only"), ro: v("raw_only"), all: v("all") };
}
