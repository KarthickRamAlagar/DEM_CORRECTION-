import { useState } from "react";
import { Card, Stat, Note, Table, Tabs, RankedDots, SPATIAL, RANDOM, f3 } from "./ui";
import { ActualVsPredicted, ResidualVsPredicted, ResidualHistogram, PROTOCOL_COLORS } from "./plots";
import { decisionCopy } from "./copy";

const TABS = [
  { id: "decision", label: "Decision & observations" },
  { id: "benchmark", label: "Model benchmark" },
  { id: "ensembles", label: "Ensembles" },
  { id: "features", label: "Features" },
  { id: "tuning", label: "Tuning" },
  { id: "final", label: "Final test" },
  { id: "plots", label: "Regressor & residual plots" },
  { id: "notes", label: "Method notes" },
];

const short = (m) => m.replace(", production", "");
const RC = RANDOM;
const SC = SPATIAL;

const domainOf = (vals, pad = 0.02) => {
  const v = vals.filter((x) => x != null);
  const lo = Math.floor((Math.min(...v) - pad) * 10) / 10;
  const hi = Math.ceil((Math.max(...v) + pad) * 10) / 10;
  return [lo, hi];
};

// two ranked panels (random / spatial), lowest error first, sharing one value axis
function RankedPair({ rows, refs, domain, leftTitle = "Random split", rightTitle = "Spatial split" }) {
  return (
    <div className="grid xl:grid-cols-2 gap-x-10 gap-y-8">
      <div>
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white mb-0.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RC }} />{leftTitle}</h3>
        <p className="text-[12.5px] text-ink-400 mb-3">Test points sit next to training points, so scores look better than they would on new ground.</p>
        <RankedDots rows={rows.map((r) => ({ label: short(r.label), value: r.a, tag: r.tag }))} domain={domain} color={RC} refLine={refs?.a} />
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-white mb-0.5"><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: SC }} />{rightTitle}</h3>
        <p className="text-[12.5px] text-ink-400 mb-3">Whole areas are held out, which is how the model will actually be used.</p>
        <RankedDots rows={rows.map((r) => ({ label: short(r.label), value: r.b, tag: r.tag }))} domain={domain} color={SC} refLine={refs?.b} />
      </div>
    </div>
  );
}

function Observations({ obs }) {
  const bar = { teal: "bg-signal-teal", amber: "bg-signal-amber", red: "bg-signal-red", green: "bg-signal-green" };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {obs.map((o, i) => (
        <div key={i} className="relative overflow-hidden rounded-lg border border-ink-700/50 bg-ink-800/40 p-4 pl-5 min-w-0">
          <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar[o.tone] || bar.teal}`} />
          <div className="text-[12.5px] text-ink-400">{o.title}</div>
          <div className="mt-1 text-[18px] leading-snug font-semibold text-ink-100 break-words">{o.metric}</div>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-300">{o.text}</p>
        </div>
      ))}
    </div>
  );
}

function DecisionTab({ e }) {
  const d = e.decision;
  const cp = d ? decisionCopy(d, e) : null;
  const singles = e.bench.filter((b) => b.model !== "Dummy Mean");
  const top = (key) => [...singles].filter((b) => b[key] != null).sort((a, b) => a[key] - b[key]).slice(0, 8);
  const shown = [...new Set([...top("rRmse"), ...top("sRmse")].map((b) => b.model))].map((m) => singles.find((b) => b.model === m));
  const dummy = e.bench.find((b) => b.model === "Dummy Mean");
  const rows = shown.map((b) => ({ label: b.model, a: top("rRmse").includes(b) ? b.rRmse : null, b: top("sRmse").includes(b) ? b.sRmse : null, tag: b.isProd ? "Production" : null }));
  return (
    <div className="space-y-5">
      {d && (
        <Card>
          <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium px-2.5 py-1 rounded-full border ${d.redo_pipeline ? "border-signal-red/50 text-signal-red" : "border-signal-green/50 text-signal-green"}`}>
            <i className={`w-1.5 h-1.5 rounded-full ${d.redo_pipeline ? "bg-signal-red" : "bg-signal-green"}`} />
            {cp.badge}
          </span>
          <h2 className="mt-3 text-[28px] leading-tight font-semibold text-ink-100">{cp.headline}</h2>
          <p className="mt-1 text-[14px] text-ink-300">{cp.sub}</p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cp.cards.map((c, i) => (
              <div key={i} className="rounded-lg border border-ink-700/50 bg-ink-800/40 p-4 min-w-0">
                <div className="text-[12.5px] text-ink-400">{c.label}</div>
                <div className="mt-1 text-[15px] font-semibold text-ink-100 break-words">{c.title}</div>
                <div className="text-[20px] font-semibold text-signal-teal leading-tight">{c.value}</div>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-300">{c.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {d && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Production model, spatial test" value={`${f3(d.production_spatial_rmse)} m`} sub="Tuned LightGBM, 29 features" tone="text-signal-teal" />
          <Stat label="Best alternative, spatial test" value={`${f3(d.best_spatial_rmse)} m`} sub={d.best_spatial_model} />
          <Stat label="Improvement over production" value={`${d.best_spatial_margin_pct.toFixed(2)}%`} sub={`${cp.threshold}% needed to switch`} tone={d.redo_pipeline ? "text-signal-red" : "text-signal-green"} />
          <Stat label="Rows evaluated" value={d.n_rows_used.toLocaleString()} sub={d.valid_for_decision ? "Full dataset" : "Not valid for this decision"} />
        </div>
      )}
      <Card
        title="Which models make the smallest errors?"
        subtitle="Root-mean-square error in metres, lowest first (top eight per validation method). The dashed line marks a model that always predicts the average error."
      >
        <RankedPair
          rows={rows}
          domain={domainOf(shown.flatMap((b) => [b.rRmse, b.sRmse]), 0.04)}
          refs={dummy ? { a: { value: dummy.rRmse, label: "Predict-the-average baseline" }, b: { value: dummy.sRmse, label: "Predict-the-average baseline" } } : null}
        />
      </Card>
      <Card title="What the results tell us" subtitle="Generated from the stored results.">
        <Observations obs={e.obs} />
      </Card>
    </div>
  );
}

const fitFmt = (v, row, side) => {
  if (v == null) return "-";
  const flag = row.timingFlag === side;
  return `${v >= 100 ? Math.round(v) : v.toFixed(0)}s${flag ? " *" : ""}`;
};

function BenchmarkTab({ e }) {
  const cols = [
    { key: "model", label: "Model", left: true },
    { key: "rRmse", label: "Random RMSE", fmt: f3 },
    { key: "rMae", label: "MAE", fmt: f3 },
    { key: "rR2", label: "R²", fmt: f3 },
    { key: "sRmse", label: "Spatial RMSE", fmt: f3 },
    { key: "sMae", label: "MAE", fmt: f3 },
    { key: "sR2", label: "R²", fmt: f3 },
    { key: "delta", label: "Spatial - random", fmt: (v) => (v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(3)) },
    { key: "rFit", label: "Fit (random)", fmt: (v, r) => fitFmt(v, r, "random") },
    { key: "sFit", label: "Fit (spatial)", fmt: (v, r) => fitFmt(v, r, "spatial") },
  ];
  const best = (k) => Math.min(...e.bench.filter((b) => b.model !== "Dummy Mean" && b[k] != null).map((b) => b[k]));
  const hasFlag = e.bench.some((b) => b.timingFlag);
  return (
    <div className="space-y-4">
      <Card title="All models, both validation methods" subtitle="Errors in metres. Click a column heading to sort. The highlighted row is the production model. Random = 4-fold random split; spatial = 10 km blocks with a 5 km buffer.">
        <Table cols={cols} rows={e.bench} sortable highlight={(r) => (r.isProd ? "win" : null)} />
        {hasFlag && <p className="text-[11px] text-ink-400 mt-2">* This time is far longer than the same model's time under the other protocol and may include idle time (the computer slept during the run). Do not read it as compute cost.</p>}
      </Card>
      <Card title="Ranking by error" subtitle="Every model, lowest error first, on a shared axis. The dashed line is the predict-the-average baseline.">
        <RankedPair
          rows={e.bench.filter((b) => b.model !== "Dummy Mean").map((b) => ({ label: b.model, a: b.rRmse, b: b.sRmse, tag: b.isProd ? "Production" : null }))}
          domain={domainOf(e.bench.filter((b) => b.model !== "Dummy Mean").flatMap((b) => [b.rRmse, b.sRmse]), 0.04)}
          refs={(() => { const dm = e.bench.find((b) => b.model === "Dummy Mean"); return dm ? { a: { value: dm.rRmse, label: "Predict-the-average baseline" }, b: { value: dm.sRmse, label: "Predict-the-average baseline" } } : null; })()}
        />
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          <Note tone="teal">Best under random split: {f3(best("rRmse"))} m.</Note>
          <Note tone="teal">Best under spatial split: {f3(best("sRmse"))} m.</Note>
        </div>
      </Card>
    </div>
  );
}

function EnsemblesTab({ e }) {
  const prodS = e.prod?.sRmse, prodR = e.prod?.rRmse;
  const cols = [
    { key: "model", label: "Ensemble", left: true },
    { key: "rRmse", label: "Random RMSE", fmt: f3 },
    { key: "rR2", label: "R²", fmt: f3 },
    { key: "sRmse", label: "Spatial RMSE", fmt: f3 },
    { key: "sR2", label: "R²", fmt: f3 },
    { key: "gain", label: "vs production (spatial)", fmt: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`) },
    { key: "note", label: "How combined", left: true },
  ];
  const rows = e.ensembles.map((x) => ({ ...x, gain: x.sRmse != null && prodS ? ((prodS - x.sRmse) / prodS) * 100 : null }));
  return (
    <div className="space-y-4">
      <Card title="Voting and stacking" subtitle={`A positive percentage means better than the production model (${f3(prodS)} m spatial, ${f3(prodR)} m random). The redo threshold is +1%.`}>
        <Table cols={cols} rows={rows} />
      </Card>
      <Card title="Ensembles ranked against production" subtitle="Lowest error first, both validation methods on one axis.">
        {(() => {
          const rows = [{ label: "LightGBM (tuned)", a: prodR, b: prodS, tag: "Production" }, ...e.ensembles.map((x) => ({ label: x.model, a: x.rRmse, b: x.sRmse }))];
          return <RankedPair rows={rows} domain={domainOf(rows.flatMap((r) => [r.a, r.b]), 0.03)} />;
        })()}
      </Card>
      <Note tone="teal">No ensemble clears the 1% bar under the spatial protocol, and every ensemble is more expensive to run than one tuned LightGBM.</Note>
    </div>
  );
}

function FeaturesTab({ e }) {
  const cfgCols = [
    { key: "config", label: "Feature set", left: true },
    { key: "nFeat", label: "# features" },
    { key: "rLgbm", label: "LightGBM random", fmt: f3 },
    { key: "sLgbm", label: "LightGBM spatial", fmt: f3 },
    { key: "sRidge", label: "Ridge spatial", fmt: f3 },
    { key: "sFoot", label: "Foothill (spatial)", fmt: f3 },
  ];
  const [proto, setProto] = useState("random");
  const base = proto === "random" ? e.baseR : e.baseS;
  const all = e.featsel.flatMap((f) => f.cells.map((c) => c[proto])).filter((v) => v != null);
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const shade = (v) => {
    if (v == null) return {};
    const t = (v - lo) / (hi - lo || 1);
    return { background: `rgb(var(--signal-teal) / ${0.4 * (1 - t) + 0.03})` };
  };
  return (
    <div className="space-y-4">
      <Card title="Feature configurations" subtitle="Four feature sets compared. 29 features was chosen: removing inputs that cannot be computed identically at prediction time costs no accuracy.">
        <Table cols={cfgCols} rows={e.configs} highlight={(r) => (r.config === "F29_parity_safe" ? "win" : null)} />
      </Card>
      <Card
        title="Feature selection"
        subtitle="Six selection methods, each keeping the top k features. Brighter cells mean lower error. The best of all is compared with keeping all 29."
        right={
          <div className="flex gap-1 shrink-0">
            {["random", "spatial"].map((p) => (
              <button key={p} onClick={() => setProto(p)} className={`px-3 py-1 rounded-md text-[13px] border capitalize ${proto === p ? "border-signal-teal/60 text-ink-100 bg-signal-teal/10" : "border-ink-700 text-ink-400"}`}>{p}</button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-ink-400 border-b border-ink-700/60">
                <th className="text-left py-2 px-2 font-medium">Method</th>
                {e.ks.map((k) => <th key={k} className="text-right py-2 px-2 font-medium">k = {k}</th>)}
              </tr>
            </thead>
            <tbody>
              {e.featsel.map((f) => (
                <tr key={f.method} className="border-b border-ink-700/30">
                  <td className="py-1.5 px-2 text-white">{f.method}</td>
                  {f.cells.map((c) => (
                    <td key={c.k} className="py-1.5 px-2 text-right font-mono text-ink-100" style={shade(c[proto])}>{f3(c[proto])}</td>
                  ))}
                </tr>
              ))}
              {base && (
                <tr className="bg-signal-teal/10">
                  <td className="py-1.5 px-2 text-white font-medium">All 29 features (baseline)</td>
                  <td colSpan={e.ks.length} className="py-1.5 px-2 text-right text-signal-teal">{f3(base.rmse)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-400 mt-2">
          RMSE in metres.{proto === "spatial" ? " Spatial values were imported from the earlier feature-selection study." : " Rankings were recomputed inside each CV fold's training rows."}
        </p>
      </Card>
    </div>
  );
}

function TuningTab({ e }) {
  const rows = e.tuning;
  const def = e.bench.find((b) => b.model === "LightGBM (default)");
  const prod = e.prod;
  return (
    <div className="space-y-4">
      <Card title="Settings search" subtitle="Three ways of searching for the best LightGBM settings, 20 trials each with 3-fold cross-validation. Error in metres, lowest first.">
        <RankedDots rows={rows.map((r) => ({ label: r.method, value: r.rmse }))} domain={domainOf(rows.map((r) => r.rmse), 0.02)} color={SC} />
        <p className="text-[11px] text-ink-400 mt-3">{rows.find((r) => r.note)?.note}</p>
      </Card>
      {def && prod && (
        <Card title="Default vs tuned LightGBM on the full benchmark">
          <Table
            cols={[
              { key: "model", label: "Model", left: true },
              { key: "r", label: "Random RMSE", fmt: f3 },
              { key: "s", label: "Spatial RMSE", fmt: f3 },
            ]}
            rows={[
              { model: "LightGBM (default)", r: def.rRmse, s: def.sRmse },
              { model: "LightGBM (tuned, production)", r: prod.rRmse, s: prod.sRmse },
            ]}
            highlight={(r) => (r.model.includes("tuned") ? "win" : null)}
          />
          <div className="mt-3"><Note tone="amber">Tuning was done on spatial folds. It helps under spatial validation and slightly hurts under a random split, which is why the random-split ranking is not used for decisions.</Note></div>
        </Card>
      )}
    </div>
  );
}

function FinalTab({ e }) {
  const cols = [
    { key: "model", label: "Model", left: true },
    { key: "rmse", label: "RMSE", fmt: f3 },
    { key: "mae", label: "MAE", fmt: f3 },
    { key: "r2", label: "R²", fmt: f3 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Spatial: frozen test strip" subtitle="A longitude strip never used for fitting, tuning or selection; scored once. This is the headline result.">
          <Table cols={cols.slice(0, 3)} rows={e.finalSpatial} highlight={(r) => (/^WINNER/.test(r.model) ? "win" : null)} />
        </Card>
        <Card title="Random: final hold-out" subtitle="20% random hold-out after refitting on all training rows. Optimistic - nearby points leak - so it cannot trigger a redo.">
          <Table cols={cols} rows={e.finalRandom} highlight={(r) => (r.model.includes("production") ? "win" : null)} />
        </Card>
      </div>
      <Note tone="amber">The frozen strip is mostly foothill terrain, which is harder than plains, so its RMSE (about 4 m) is higher than the pooled cross-validation RMSE (about 3 m). The two numbers measure different things.</Note>
    </div>
  );
}

function PlotsTab({ e }) {
  const [view, setView] = useState("avp");
  const views = [
    { id: "avp", label: "Actual vs predicted" },
    { id: "res", label: "Residual vs predicted" },
    { id: "hist", label: "Residual distribution" },
  ];
  const prot = ["random", "spatial"].map((k) => ({ k, s: e.plots[k]?.actual_vs_pred })).filter((x) => x.s);
  const Comp = view === "avp" ? ActualVsPredicted : view === "res" ? ResidualVsPredicted : ResidualHistogram;
  if (!prot.length) return <Card><p className="text-sm text-ink-400">No plot samples are stored in the benchmark database.</p></Card>;
  return (
    <div className="space-y-4">
      <Tabs tabs={views} value={view} onChange={setView} variant="pill" />
      <div className="grid lg:grid-cols-2 gap-4">
        {prot.map(({ k, s }) => (
          <Card key={k} title={k === "random" ? "Random split" : "Spatial split"} subtitle={`${s.model} - ${s.y.length.toLocaleString()} randomly sampled test points`}>
            <Comp y={s.y} p={s.p} color={PROTOCOL_COLORS[k]} />
          </Card>
        ))}
      </div>
      <Note tone="teal">Plots use a stored random sample of test points, not all 1.2 million rows, so the cloud is readable. The headline metrics elsewhere on this page use every test row.</Note>
    </div>
  );
}

function NotesTab({ e }) {
  const m = e.meta, dsg = m.design || {};
  const items = [
    ["Rows", `${(m.n_rows_total || 0).toLocaleString()} rows in the golden dataset; ${m.self_test_subsample ? "THIS IS A SELF-TEST SUBSAMPLE, NOT THE REAL RUN" : "the real run used all of them"}.`],
    ["Splits", m.split_sizes ? `Random: ${m.split_sizes.random_train?.toLocaleString()} train / ${m.split_sizes.random_test?.toLocaleString()} test. Spatial CV uses ${m.split_sizes.spatial_cv_rows?.toLocaleString()} rows (rows inside the 5 km buffers are dropped).` : "-"],
    ["Training caps", `To keep the run feasible, cross-validation models were trained on at most ${(dsg.cv_train_cap || 0).toLocaleString()} rows per fold, SVR on ${(dsg.svr_train_cap || 0).toLocaleString()}, and slow models were scored on at most ${(dsg.slow_eval_cap || 0).toLocaleString()} rows. So "all rows" is true for the dataset, not for every model fit.`],
    ["Seed", `${dsg.seed ?? "-"} (fixed).`],
    ["Where results come from", Object.entries(e.sources).map(([k, v]) => `${v} rows ${k}`).join("; ") + ". The production model's spatial numbers were imported from the earlier spatial study."],
    ["Timings", "Fit times marked * may include idle time because the computer slept during the run."],
    ["Target", String(m.target_formula || "elevation_error_signed = elevation_ref - raw_z")],
    ["Last run", m.last_run_utc ? new Date(m.last_run_utc).toLocaleString() : "-"],
  ];
  return (
    <Card title="Method notes" subtitle="What the numbers on this page can and cannot tell you.">
      <dl className="grid sm:grid-cols-[170px_1fr] gap-x-4 gap-y-3 text-[13px]">
        {items.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-400">{k}</dt>
            <dd className="text-ink-200">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function BenchmarkSection({ e }) {
  const [tab, setTab] = useState("decision");
  return (
    <div className="space-y-5">
      {e.meta.self_test_subsample && (
        <Note tone="red">Self-test sample: these numbers come from a small subsample used only to test the page. Run the full benchmark to see the real results.</Note>
      )}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="pb-10">
        {tab === "decision" && <DecisionTab e={e} />}
        {tab === "benchmark" && <BenchmarkTab e={e} />}
        {tab === "ensembles" && <EnsemblesTab e={e} />}
        {tab === "features" && <FeaturesTab e={e} />}
        {tab === "tuning" && <TuningTab e={e} />}
        {tab === "final" && <FinalTab e={e} />}
        {tab === "plots" && <PlotsTab e={e} />}
        {tab === "notes" && <NotesTab e={e} />}
      </div>
    </div>
  );
}
