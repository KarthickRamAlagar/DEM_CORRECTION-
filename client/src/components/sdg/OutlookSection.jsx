import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOutlook, fetchOutlookMethod } from "../../lib/outlookApi";
import { fmtInt, fmtRange, fmtMoney, NO_DATA } from "../../lib/sdgApi";
import { Banner, Segmented, Bento, BentoCard } from "./Ui";
import { fmtDay, seasonYear } from "../../lib/dateFmt";

// District flood outlook (patch 10). Numbers come from etl/forecast/build_outlook.py through /api/sdg/outlook. Nothing is computed here.
// It is a statistical outlook for "a typical coming year", tested on years the model had not seen. It is not a flood warning and not a weather forecast.
const COUNTRIES = [{ id: "IND", label: "India" }, { id: "NPL", label: "Nepal (plains)" }];
const BOUNDS = [{ id: "lower_unflagged", label: "Conservative" }, { id: "upper_union", label: "Upper" }];
const MODEL_NAME = { history: "Plain history", recent_weighted: "Recent years count more", trend: "Trend" };
const pct = (v) => (v == null ? NO_DATA : `${Math.round(v * 100)}%`);

function Range({ lo, mid, hi, max }) {            // 10th to 90th percentile bar with the middle value marked
  if (lo == null || hi == null || !max) return <span className="text-ink-400">{NO_DATA}</span>;
  const a = (lo / max) * 100, b = (hi / max) * 100, m = ((mid ?? lo) / max) * 100;
  return (
    <div className="relative h-2 w-full rounded-full bg-ink-800" role="img" aria-label={`${fmtInt(lo)} to ${fmtInt(hi)}, middle ${fmtInt(mid)}`}>
      <div className="absolute top-0 h-2 rounded-full bg-signal-teal/45" style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }} />
      <div className="absolute -top-0.5 h-3 w-[3px] rounded bg-signal-teal" style={{ left: `calc(${m}% - 1px)` }} />
    </div>
  );
}

export default function OutlookSection() {
  const [country, setCountry] = useState("IND");
  const [bound, setBound] = useState("upper_union");
  const q = useQuery({ queryKey: ["sdg-outlook", country, bound], queryFn: () => fetchOutlook({ country, bound, limit: 15 }), retry: false });
  const m = useQuery({ queryKey: ["sdg-outlook-method"], queryFn: fetchOutlookMethod, retry: false });
  const rows = q.data?.rows ?? [];
  const max = Math.max(0, ...rows.map((r) => r.people_p90 ?? 0));
  const s = m.data?.summary?.[bound]; const cal = s?.calibration;

  return (
    <section aria-labelledby="outlook-h">
      <h3 id="outlook-h" className="text-[15px] font-medium text-ink-100">Flood outlook by district: a typical coming year</h3>
      {m.data?.built_utc && <p className="mt-1 text-[13px] text-ink-300">Built on {fmtDay(m.data.built_utc)}, for the {seasonYear(m.data.built_utc)} monsoon season (June to October). Not a forecast for one day.</p>}
      <div className="mt-2"><Banner tone="amber">
        <strong>A statistical outlook, not a flood warning.</strong> It uses the satellite flood record 2019 to 2025 ({m.data ? `${m.data.series_used} district series` : "district series"}; 2026 is left out because the year is not finished). Each figure is a range, widened until it held the real value about 8 times in 10 on years the model had not seen. It does not use rainfall or a river forecast yet. Counts are exposure, not casualties. Money is an estimated recovery need, not a release decision.
      </Banner></div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Segmented label="Country" options={COUNTRIES} value={country} onChange={setCountry} />
        <Segmented label="Satellite bound" options={BOUNDS} value={bound} onChange={setBound} />
      </div>

      {(q.isError || m.isError) && <div className="mt-3"><Banner tone="amber">{q.error?.message || m.error?.message}</Banner></div>}

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <caption className="sr-only">Outlook for a typical coming year, districts with the highest upper people-exposed range</caption>
            <thead className="bg-ink-850/70 text-ink-200"><tr>
              <th scope="col" className="px-3 py-2 font-medium">District</th>
              <th scope="col" className="px-3 py-2 font-medium">Chance of any flooding</th>
              <th scope="col" className="px-3 py-2 font-medium w-[26%]">People exposed (range, middle marked)</th>
              <th scope="col" className="px-3 py-2 font-medium">Middle to upper</th>
              <th scope="col" className="px-3 py-2 font-medium">Estimated recovery need (INR)</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.iso}-${r.district}`} className="border-t border-ink-700/50 text-ink-100">
                  <th scope="row" className="px-3 py-2 font-medium">{r.district}<div className="text-[11.5px] font-normal text-ink-400">{r.years_with_flooding} of {r.years_in_record} years had flooding</div></th>
                  <td className="px-3 py-2 tabular-nums">{r.p_flood_low == null ? pct(r.p_flood) : `${pct(r.p_flood_low)} to ${pct(r.p_flood_high)}`}</td>
                  <td className="px-3 py-2"><div className="tabular-nums text-[13px]">{fmtRange(r.people_p10, r.people_p90, fmtInt)}</div><Range lo={r.people_p10} mid={r.people_p50} hi={r.people_p90} max={max} /></td>
                  <td className="px-3 py-2 tabular-nums">{r.people_p50 == null ? NO_DATA : `${fmtInt(r.people_p50)} to ${fmtInt(r.people_p90)}`}{r.people_p90_pct_of_district != null && <div className="text-[11.5px] text-ink-400">up to {r.people_p90_pct_of_district.toFixed(1)}% of district</div>}</td>
                  <td className="px-3 py-2 tabular-nums">{r.need_inr_p50_low == null ? NO_DATA : fmtRange(r.need_inr_p50_low, r.need_inr_p90_high, (v) => fmtMoney(v, "INR"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && <p className="mt-2 text-[13px] text-ink-300">Top {rows.length} of {q.data.districts_total} districts with full satellite coverage, sorted by the upper end of people exposed. Districts with partial coverage are left out, not guessed.</p>}

      {s && s.models[s.chosen] && (
        <div className="mt-4"><Bento>
          <BentoCard title="Model used" value={MODEL_NAME[s.chosen] ?? s.chosen} sub={`Tested on years it had not seen: ${m.data.test_years.join(", ")}`} className="md:col-span-2 lg:col-span-4" />
          <BentoCard title="Better than plain history" value={s.chosen === "history" ? "Reference" : `${s.models[s.chosen].skill_vs_history >= 0 ? "+" : ""}${(s.models[s.chosen].skill_vs_history * 100).toFixed(1)}%`} sub="A small gain: read this as the record with recent years counted more, not a sharp prediction." className="md:col-span-2 lg:col-span-4" />
          <BentoCard title="Years better" value={s.chosen === "history" ? "Reference" : `${s.models[s.chosen].years_better_than_history} of ${m.data.test_years.length}`} sub="Test years where it beat plain history." className="md:col-span-2 lg:col-span-4" />
        </Bento></div>
      )}
    </section>
  );
}
