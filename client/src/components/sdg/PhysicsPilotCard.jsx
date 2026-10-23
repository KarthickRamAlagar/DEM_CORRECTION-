import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../../lib/apiBase";
import { fmtDay } from "../../lib/dateFmt";

// Patch 14 / 14c. Shown ONLY when the stricter physics check passed (physics_gate_v2.json, scored on scenes not used to choose the model setup). Otherwise renders nothing.
const get = async () => { const r = await fetch(`${API_BASE}/sdg/physics/status`); if (!r.ok) throw new Error("physics status"); return r.json(); };
const pct = (v) => (v == null ? "No data" : `${(v * 100).toFixed(0)}%`);

export default function PhysicsPilotCard() {
  const q = useQuery({ queryKey: ["sdg-physics-status"], queryFn: get, staleTime: 10 * 60 * 1000, retry: false });
  const d = q.data; if (!d || !d.passed) return null;
  const ce = d.correction_effect?.mean_corrected_minus_raw;
  return (
    <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850/60 p-5" aria-label="Physics flood pilot">
      <h3 className="text-[16px] font-semibold text-white">Water movement over time (pilot)</h3>
      <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-200">
        On a small window, a physics model let a rising river spread over the ground and compared the flooded area with satellite flood scenes. It matched {d.events_won} of {d.events_scored} scenes better than the terrain what-if, a flood-everything map and a random map of the same flooded area.
        These scenes were not used to choose the model settings. This is a pilot on one window. It is not a forecast and does not change any number elsewhere in the app.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-ink-300"><tr><th className="py-1.5 pr-3 font-medium">Satellite scene</th><th className="pr-3 font-medium">River rise that day</th><th className="pr-3 font-medium">Physics model overlap</th><th className="pr-3 font-medium">Terrain what-if, same flooded area</th><th className="font-medium">Flood-everything map</th></tr></thead>
          <tbody>{(d.events || []).map((e) => (
            <tr key={e.name} className="border-t border-ink-700 tabular-nums"><td className="py-1.5 pr-3">{e.obs_date ? fmtDay(e.obs_date) : e.name}</td><td className="pr-3">{e.river_rise_at_obs_m} m (assumed)</td><td className="pr-3">{pct(e.physics_iou)}</td><td className="pr-3">{pct(e.terrain_whatif_same_area_iou)}</td><td>{pct(e.flood_everything_iou)}</td></tr>))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-400">Overlap = area flooded in both the model and the satellite scene, divided by the area flooded in either. {d.assumptions?.join(" ")}{ce != null ? ` Using the corrected elevation instead of the raw one changed the physics overlap by ${(ce * 100).toFixed(1)} points on average.` : ""}</p>
    </section>
  );
}
