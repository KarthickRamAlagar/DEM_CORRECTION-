import { API_BASE } from "../../lib/apiBase";
import { useEffect, useMemo, useState } from "react";
import { Card, Stat, Note, Bars, Table, Tabs, f2, pct } from "./ui";

const API = `${API_BASE}/model`;
const TABS = [
  { id: "cv", label: "Cross-validation" },
  { id: "frozen", label: "Frozen test strip" },
  { id: "terrain", label: "Plains vs foothill" },
  { id: "interval", label: "Interval coverage" },
  { id: "shap", label: "SHAP (global + local)" },
];

function CVTab({ d }) {
  const [showRule, setShowRule] = useState(false);
  const cols = [
    { key: "model", label: "Model", left: true },
    { key: "RMSE", label: "RMSE", fmt: f2 },
    { key: "MAE", label: "MAE", fmt: f2 },
    { key: "MedAE", label: "MedAE", fmt: f2 },
    { key: "LE90", label: "LE90", fmt: f2 },
    { key: "Bias", label: "Bias", fmt: f2 },
    { key: "RMSE_plains", label: "Plains", fmt: f2 },
    { key: "RMSE_foothill", label: "Foothill", fmt: f2 },
    { key: "worst_fold_RMSE", label: "Worst fold", fmt: f2 },
  ];
  const rows = [...d.cv_table].sort((a, b) => a.RMSE - b.RMSE);
  return (
    <div className="space-y-4">
      <Card title="Model tournament - 4-strip spatial cross-validation"
        subtitle="Metres. Each fold is a longitude strip the model never saw, with a 5 km buffer. Highlighted = chosen model; shaded = within 1% of the best pooled RMSE (treated as tied).">
        <Table cols={cols} rows={rows} highlight={(r) => (r.model === d.winner ? "win" : r.within_1pct_of_best ? "tie" : null)} />
        <div className="mt-3">
          <Note tone="teal">
            The lowest pooled RMSE was an ensemble, but several models were within 1%. The pre-declared rule then prefers the one with fewer base models and
            lower inference cost, which is the tuned LightGBM. The rule was written before scoring.
          </Note>
        </div>
        <button onClick={() => setShowRule((s) => !s)} className="mt-3 text-[12px] text-signal-teal hover:underline">
          {showRule ? "Hide" : "Show"} the pre-declared selection rule
        </button>
        {showRule && <pre className="mt-2 text-[11px] text-ink-300 whitespace-pre-wrap bg-ink-950/60 rounded-lg p-3 border border-ink-700/50">{d.selection_rule}</pre>}
      </Card>
      <Card title="Feature-set test" subtitle="Why 29 features: removing inputs that cannot be computed identically at prediction time cost no accuracy.">
        <Table
          cols={[
            { key: "features", label: "Feature set", left: true },
            { key: "n_features", label: "# features" },
            { key: "algo", label: "Algorithm", left: true },
            { key: "RMSE", label: "RMSE", fmt: f2 },
            { key: "RMSE_foothill", label: "Foothill", fmt: f2 },
            { key: "worst_fold_RMSE", label: "Worst fold", fmt: f2 },
          ]}
          rows={d.feature_set_table}
          highlight={(r) => (r.features === "F29_parity_safe" ? "win" : null)}
        />
      </Card>
    </div>
  );
}

function FrozenTab({ d }) {
  const rows = d.frozen_table;
  const win = rows.find((r) => r.model.startsWith("WINNER"));
  const raw = rows.find((r) => r.model.startsWith("Raw"));
  const cols = [
    { key: "model", label: "Method", left: true },
    { key: "RMSE", label: "RMSE", fmt: f2 },
    { key: "MAE", label: "MAE", fmt: f2 },
    { key: "MedAE", label: "MedAE", fmt: f2 },
    { key: "LE90", label: "LE90", fmt: f2 },
    { key: "Bias", label: "Bias", fmt: f2 },
    { key: "RMSE_nonvoid", label: "RMSE excl. voids", fmt: f2 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Raw CartoDEM RMSE" value={`${f2(raw.RMSE)} m`} sub={`${raw.n.toLocaleString()} unseen ICESat-2 points`} />
        <Stat label="Corrected RMSE" value={`${f2(win.RMSE)} m`} tone="text-signal-teal" sub="chosen model, scored once" />
        <Stat label="Reduction" value={`${(100 * (1 - win.RMSE / raw.RMSE)).toFixed(1)}%`} tone="text-signal-teal" sub="RMSE vs raw, same points" />
      </div>
      <Card title="Frozen test strip (final exam)" subtitle="Strip 3 was never used for fitting, tuning, feature choice or model choice. The chosen model was scored on it once.">
        <Table cols={cols} rows={rows} highlight={(r) => (r.model.startsWith("WINNER") ? "win" : null)} />
        <div className="mt-4">
          <Bars rows={rows.map((r) => ({ label: r.model.replace("WINNER: ", ""), value: r.RMSE, bold: r.model.startsWith("WINNER"), color: r.model.startsWith("WINNER") ? "rgb(var(--signal-teal))" : r.model.startsWith("Raw") ? "rgb(var(--signal-red))" : "rgb(var(--ink-500))" }))} />
        </div>
        <div className="mt-3">
          <Note>
            The corrected error is lower than raw on this strip, but the frozen strip is harder than the cross-validation folds (4.06 m vs 2.98 m pooled). Quote the frozen number as the honest estimate for new areas.
          </Note>
        </div>
      </Card>
      <Card title="Pooled out-of-fold error (all points)" subtitle={`${d.oof.n.toLocaleString()} points, each predicted by a model that never saw its strip. Share of points by absolute error.`}>
        <div className="grid grid-cols-6 gap-2 text-[11px]">
          {d.oof.abs_error_bins.labels.map((lab, i) => (
            <div key={lab} className="text-center">
              <div className="h-24 flex items-end justify-center gap-1">
                <div className="w-4 rounded-t" style={{ height: `${d.oof.abs_error_bins.raw[i] * 96 / 0.5}%`, maxHeight: "100%", background: "rgb(var(--signal-red))" }} title={`Raw ${pct(d.oof.abs_error_bins.raw[i])}`} />
                <div className="w-4 rounded-t" style={{ height: `${d.oof.abs_error_bins.corrected[i] * 96 / 0.5}%`, maxHeight: "100%", background: "rgb(var(--signal-teal))" }} title={`Corrected ${pct(d.oof.abs_error_bins.corrected[i])}`} />
              </div>
              <p className="text-ink-300 mt-1">{lab}</p>
              <p className="text-ink-500 font-mono">{pct(d.oof.abs_error_bins.raw[i])} / {pct(d.oof.abs_error_bins.corrected[i])}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-400 mt-2"><span className="text-signal-red">Red</span> = raw, <span className="text-signal-teal">teal</span> = corrected. Pooled RMSE {f2(d.oof.raw_rmse)} m raw vs {f2(d.oof.corrected_rmse)} m corrected.</p>
      </Card>
    </div>
  );
}

function TerrainTab({ d }) {
  const sel = d.frozen_table.filter((r) => /^(Raw|Constant|WINNER|LightGBM v1)/.test(r.model));
  return (
    <div className="space-y-4">
      <Card title="Plains vs Himalayan foothill (frozen strip, RMSE)" subtitle="The study area is the Gangetic Plain with a Himalayan foothill margin (lat 25-28 N), not the high Himalaya.">
        {sel.map((r) => (
          <div key={r.model} className="mb-4">
            <p className="text-[12px] text-white mb-1">{r.model.replace("WINNER: ", "Chosen: ")}</p>
            <Bars max={10} rows={[
              { label: "Plains", value: r.RMSE_plains, color: "rgb(var(--signal-teal))" },
              { label: "Foothill", value: r.RMSE_foothill, color: "rgb(var(--signal-amber))" },
            ]} />
          </div>
        ))}
        <Note>
          The model is strong on plains (about 2 m) and still weak on the foothill margin (about 6 m). The foothill number is the main limit of this model; present it openly.
        </Note>
      </Card>
    </div>
  );
}

function IntervalTab({ d }) {
  const it = d.interval;
  const rows = it.groups.map((g) => ({ label: `${g.terrain} / ${g.roughness_tercile} (n=${g.n.toLocaleString()})`, value: g.coverage * 100, color: g.coverage >= 0.9 ? "rgb(var(--signal-teal))" : g.coverage >= 0.84 ? "rgb(var(--signal-amber))" : "rgb(var(--signal-red))" }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Nominal coverage" value="90%" sub="what the interval is built to achieve" />
        <Stat label="Actual on frozen strip" value={pct(it.frozen_coverage)} tone="text-signal-amber" sub="unseen area (spatial shift)" />
        <Stat label="Interval method" value="Mondrian conformal" sub="grouped by terrain class x roughness" />
      </div>
      <Card title="Coverage by group (frozen strip)" subtitle="White line = 90% target.">
        <Bars rows={rows} max={100} unit="%" decimals={1} refLine={90} />
        <div className="mt-3 space-y-2">
          <Note>
            Intervals under-cover by about 4.5 points on a new area. Rough foothill terrain (78%) is the weakest group. Treat the +/- bands as approximate, and do not call them a guaranteed 90% interval.
          </Note>
        </div>
      </Card>
      <Card title="Interval half-width by group (m)" subtitle="Calibrated on out-of-fold residuals from the 4 CV strips.">
        <Bars rows={it.groups.map((g) => ({ label: `${g.terrain} / ${g.roughness_tercile}`, value: g.q90_m, color: "rgb(var(--ink-500))" }))} unit=" m" />
      </Card>
    </div>
  );
}

const PRESETS = ["slope_mean_5x5", "raw_z", "terrain_region_class", "elev_mean_3x3", "tpi", "elev_std_3x3", "band_B12", "tri"];

function ShapTab({ d }) {
  const gl = useMemo(() => Object.entries(d.shap_global).sort((a, b) => b[1] - a[1]).slice(0, 15), [d]);
  const [typ, setTyp] = useState(null);
  const [vals, setVals] = useState({});
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API}/features`).then((r) => r.json()).then((j) => { setTyp(j.typical_values); setVals(Object.fromEntries(PRESETS.map((k) => [k, j.typical_values[k]]))); }).catch(() => setErr("Could not load typical values."));
  }, []);

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const body = { features: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])), top_k: 10 };
      const r = await fetch(`${API}/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
      setRes(await r.json());
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const maxC = res ? Math.max(...res.top_features.map((t) => Math.abs(t.contribution_m)), 0.01) : 1;
  return (
    <div className="space-y-4">
      <Card title="Global SHAP - what drives the correction" subtitle="Mean |SHAP| in metres across a sample of the dataset (exact TreeSHAP from the LightGBM model). Bigger = the feature moves the predicted error more on average.">
        <Bars rows={gl.map(([k, v]) => ({ label: k, value: v }))} unit=" m" decimals={3} />
        <div className="mt-3"><Note tone="teal">SHAP shows what the model uses, not physical cause. Slope and terrain class rank highest, which fits DEM error being larger on steep, rough ground (an interpretation, not a proven cause).</Note></div>
      </Card>
      <Card title="Local SHAP - explain one point" subtitle="Edit the main inputs (all other features use the typical dataset value), then explain. Contributions add up to the predicted error.">
        {typ ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRESETS.map((k) => (
              <label key={k} className="text-[11px] text-ink-400">
                {k}
                <input type="number" step="any" value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  className="mt-1 w-full bg-ink-800 border border-ink-700 rounded-lg px-2 py-1.5 text-[13px] text-white font-mono" />
              </label>
            ))}
          </div>
        ) : <p className="text-[12px] text-ink-400">Loading typical values...</p>}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={run} disabled={busy || !typ} className="px-3 py-1.5 rounded-lg text-[12px] bg-signal-teal/15 border border-signal-teal/40 text-signal-teal disabled:opacity-50">
            {busy ? "Explaining..." : "Explain this point"}
          </button>
          {typ && <button onClick={() => setVals(Object.fromEntries(PRESETS.map((k) => [k, typ[k]])))} className="text-[12px] text-ink-400 hover:text-white">Reset to typical</button>}
        </div>
        {err && <p className="text-[12px] text-signal-red mt-2">{err}</p>}
        {res && (
          <div className="mt-4">
            <p className="text-[12px] text-ink-300 mb-2">
              Base value {f2(res.base_value)} m + feature effects = predicted error <span className="text-white font-mono">{f2(res.prediction)} m</span> (corrected = raw + predicted error).
            </p>
            <div className="space-y-1.5">
              {res.top_features.map((t) => {
                const w = (Math.abs(t.contribution_m) / maxC) * 50;
                const pos = t.contribution_m >= 0;
                return (
                  <div key={t.feature} className="flex items-center gap-3 text-[12px]">
                    <span className="w-44 shrink-0 truncate text-ink-300" title={`${t.feature} = ${t.value}`}>{t.feature} = {Number(t.value).toFixed(2)}</span>
                    <div className="relative flex-1 h-4 bg-ink-800/70 rounded">
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-ink-500" />
                      <div className="absolute h-4 rounded" style={{ width: `${w}%`, left: pos ? "50%" : `${50 - w}%`, background: pos ? "rgb(var(--signal-teal))" : "rgb(var(--signal-red))" }} />
                    </div>
                    <span className="w-16 text-right font-mono text-ink-200">{t.contribution_m >= 0 ? "+" : ""}{t.contribution_m.toFixed(2)} m</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-500 mt-2">Teal raises the elevation (reference higher than raw); red lowers it. Only the 10 largest effects are shown.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function SpatialSection({ data }) {
  const [tab, setTab] = useState("cv");
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="space-y-4 pb-8">
        {tab === "cv" && <CVTab d={data} />}
        {tab === "frozen" && <FrozenTab d={data} />}
        {tab === "terrain" && <TerrainTab d={data} />}
        {tab === "interval" && <IntervalTab d={data} />}
        {tab === "shap" && <ShapTab d={data} />}
        {data.known_limits?.length > 0 && (
          <Card title="Known limits">
            <ul className="list-disc pl-5 text-[12px] text-ink-300 space-y-1">{data.known_limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
