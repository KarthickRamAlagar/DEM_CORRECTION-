import { useQuery } from "@tanstack/react-query";
import { fetchRainOutlook, fetchRainMethod } from "../../lib/rainOutlookApi";
import { fmtInt, fmtRange, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented } from "./Ui";

// Patch 22 (D1): the dry / typical / wet season rain what-if, for the district of the chosen place, inside step 1 of the flow.
// Numbers come from /api/sdg/outlook/rain (built by etl/forecast/build_rain_model.py). It is NOT a rainfall forecast, and it does not change the river-rise setting below.
// A bound is shown only if the rain model beat plain history on years it had not seen; otherwise the card says so and shows no rain-based numbers.
export const SEASONS = [{ id: "dry", label: "Dry season" }, { id: "typical", label: "Typical season" }, { id: "wet", label: "Wet season" }];
export const seasonLabel = (id) => SEASONS.find((s) => s.id === id)?.label ?? id;
const BOUNDS = [{ id: "upper_union", label: "Upper bound" }, { id: "lower_unflagged", label: "Conservative bound" }];

function useBound(here, bound) {
  return useQuery({
    queryKey: ["rain-district", here?.iso, here?.name, bound],
    queryFn: () => fetchRainOutlook({ country: here.iso, bound, target: "people", district: here.name, limit: 1 }),
    enabled: !!here, retry: 0,
  });
}

export default function RainScenarioCard({ here, season, onSeason }) {
  const m = useQuery({ queryKey: ["rain-method"], queryFn: fetchRainMethod, retry: false });
  const up = useBound(here, "upper_union");
  const lo = useBound(here, "lower_unflagged");
  if (!here) return null;
  const sum = (b) => m.data?.summary?.[`people|${b}`];
  const rows = { upper_union: up.data?.rows?.[0], lower_unflagged: lo.data?.rows?.[0] };
  const used = (b) => sum(b) && sum(b).chosen !== "history";
  const any = BOUNDS.some((b) => used(b.id) && rows[b.id]);
  const loading = m.isLoading || up.isLoading || lo.isLoading;

  return (
    <div>
      <h3 className="mt-8 mb-3 text-[16px] font-semibold text-white">Dry, typical or wet season: people exposed in {here.name}</h3>
      <div className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-5">
        <Banner tone="amber"><strong>A what-if on rain, not a rainfall forecast.</strong> It asks: if this season's rain is like the drier, middle or wetter third of the seasons seen in 2019 to 2025, how many people in this district would be exposed to flooding? It does not change the river rise you choose below, and counts are exposure, not casualties.</Banner>
        <div className="mt-4"><Segmented label="Rain season" options={SEASONS} value={season} onChange={onSeason} /></div>
        {loading && <p className="mt-3 text-[13.5px] text-ink-300">Loading the rain what-if...</p>}
        {m.isError && <p className="mt-3 text-[13.5px] text-ink-300">{NO_DATA}: {m.error.message}</p>}
        {!loading && !m.isError && (
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {BOUNDS.map((b) => {
              const r = rows[b.id]?.[season];
              return (
                <div key={b.id} className="min-w-0">
                  <dt className="text-[13px] text-ink-300">{b.label}, {seasonLabel(season).toLowerCase()}</dt>
                  <dd className="mt-0.5 text-[20px] font-semibold text-white tabular-nums">{!used(b.id) ? NO_DATA : r ? fmtRange(r.p10, r.p90, fmtInt) : NO_DATA}</dd>
                  <dd className="mt-0.5 text-[12.5px] text-ink-400">
                    {!sum(b.id) ? "Model summary not available" : !used(b.id) ? "Rain did not beat plain history on unseen years, so no rain-based number is shown" : r ? `People, middle ${fmtInt(r.p50)}` : "This district has no rain-model row (no rainfall cell or partial satellite coverage)"}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        {!loading && !m.isError && !any && <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-ink-300">The plain district outlook above stays the answer for this place.</p>}
        <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-400">Chosen season: {seasonLabel(season)}. It is kept with this run and shown in the summary. Range = 10th to 90th percentile of the model.</p>
      </div>
    </div>
  );
}
