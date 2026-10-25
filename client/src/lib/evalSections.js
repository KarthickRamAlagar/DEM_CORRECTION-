// The DEM-Correction model evaluation, drawn into the DEM-AREA-SDG report (same figures as the Evaluation page report).
// e = buildEval(summary) from pages/evaluation/derive.js, spatial = /api/model/metrics. Nothing is typed in here: every number comes from them.
import { COL, clean } from "./reportFlow";
import { decisionCopy } from "../pages/evaluation/copy";
import { quantile } from "../pages/evaluation/derive";

const f3 = (v) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(3));
const f2 = (v) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(2));
const TONE = { amber: [217, 119, 6], red: COL.red, green: COL.green };

export function addEvaluation(f, { e, spatial }) {
  const d = f.doc, { M, CW } = f;
  f.section("Model evaluation: how far to trust the correction");
  if (!e) { f.para("No data. The stored evaluation results could not be loaded for this report. Open the Evaluation page to check that the server has them.", { color: COL.grey }); return; }
  const m = e.meta, dc = e.decision;
  f.para(`How well the CartoDEM elevation correction works on ground it has never seen. Data: ${(m.n_rows_total || 0).toLocaleString()} rows (golden dataset). Last run: ${m.last_run_utc ? new Date(m.last_run_utc).toLocaleString() : "-"}. Target: elevation error = reference - raw DEM.`, { size: 8, color: COL.grey });
  if (dc) {
    const cp = decisionCopy(dc, e), col = dc.redo_pipeline ? COL.red : COL.green;
    f.h2("Decision");
    f.decision({ badge: cp.badge, headline: cp.headline, sub: cp.sub, cards: cp.cards, color: col });
    f.kpi([
      { label: "Production, spatial test", value: `${f3(dc.production_spatial_rmse)} m`, sub: "tuned LightGBM, 29 features", color: COL.blue },
      { label: "Best alternative", value: `${f3(dc.best_spatial_rmse)} m`, sub: "spatial test" },
      { label: "Improvement", value: `${dc.best_spatial_margin_pct.toFixed(2)}%`, sub: `${cp.threshold}% needed to switch`, color: col },
      { label: "Rows evaluated", value: dc.n_rows_used.toLocaleString(), sub: dc.valid_for_decision ? "full dataset" : "NOT valid" },
    ]);
  }
  f.h2("What the results tell us");
  (e.obs || []).forEach((o) => f.bullet(`${o.title} (${o.metric}). ${o.text}`, TONE[o.tone] || COL.blue));

  f.section("Benchmark study", { index: false });
  f.h2("Model benchmark");
  f.para("Errors in metres. Random = 4-fold random split; spatial = 10 km blocks with a 5 km buffer. Highlighted row = production model.", { size: 7.5, color: COL.grey });
  f.table([
    { label: "Model", key: "model", left: true, w: 3.4 }, { label: "Rand RMSE", key: "rRmse", fmt: f3 }, { label: "Rand R2", key: "rR2", fmt: f3 },
    { label: "Spat RMSE", key: "sRmse", fmt: f3 }, { label: "Spat R2", key: "sR2", fmt: f3 }, { label: "Spat-Rand", key: "delta", fmt: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}`) },
  ], e.bench, { highlight: (r) => (r.isProd ? "win" : null) });

  const dm = e.bench.find((b) => b.model === "Dummy Mean");
  f.h2("Ranking by error");
  rankedPair(f, e.bench.filter((b) => b.model !== "Dummy Mean").map((b) => ({ label: b.model.replace(", production", ""), a: b.rRmse, b: b.sRmse, tag: b.isProd })), dm ? { a: dm.rRmse, b: dm.sRmse } : null);

  f.h2("Ensembles");
  f.table([
    { label: "Ensemble", key: "model", left: true, w: 4 }, { label: "Rand RMSE", key: "rRmse", fmt: f3 }, { label: "Spat RMSE", key: "sRmse", fmt: f3 }, { label: "Spat R2", key: "sR2", fmt: f3 },
    { label: "vs prod", key: "gain", fmt: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`) },
  ], e.ensembles.map((x) => ({ ...x, gain: x.sRmse != null && e.prod?.sRmse ? ((e.prod.sRmse - x.sRmse) / e.prod.sRmse) * 100 : null })));

  f.h2("Feature configurations");
  f.table([
    { label: "Feature set", key: "config", left: true, w: 2.6 }, { label: "# feat", key: "nFeat" }, { label: "LGBM random", key: "rLgbm", fmt: f3 },
    { label: "LGBM spatial", key: "sLgbm", fmt: f3 }, { label: "Ridge spatial", key: "sRidge", fmt: f3 }, { label: "Foothill", key: "sFoot", fmt: f3 },
  ], e.configs, { highlight: (r) => (r.config === "F29_parity_safe" ? "win" : null) });

  f.h2("Feature selection");
  const fsRows = e.featsel.map((x) => {
    const best = (p) => x.cells.filter((c) => c[p] != null).sort((a, b) => a[p] - b[p])[0], br = best("random"), bs = best("spatial");
    return { method: x.method, rk: br ? `k=${br.k}` : "-", r: br?.random, sk: bs ? `k=${bs.k}` : "-", s: bs?.spatial };
  });
  f.table([{ label: "Method", key: "method", left: true, w: 2.6 }, { label: "Best k (rand)", key: "rk" }, { label: "RMSE", key: "r", fmt: f3 }, { label: "Best k (spat)", key: "sk" }, { label: "RMSE", key: "s", fmt: f3 }], fsRows);
  f.para(`All 29 features (baseline): ${f3(e.baseR?.rmse)} m random, ${f3(e.baseS?.rmse)} m spatial.` + (e.fsSummary?.spatial ? ` Best subset under spatial CV: ${e.fsSummary.spatial.best.method} k=${e.fsSummary.spatial.best.k} at ${f3(e.fsSummary.spatial.best.v)} m (${e.fsSummary.spatial.gainPct.toFixed(2)}% vs all 29, ${e.fsSummary.spatial.gainPct < 1 ? "below" : "above"} the 1% bar).` : ""), { size: 8 });

  f.h2("Settings search");
  f.table([{ label: "Method", key: "method", left: true, w: 3 }, { label: "CV RMSE", key: "rmse", fmt: f3 }], e.tuning);

  f.h2("Final test");
  f.para("Spatial: frozen test strip (never used for fitting, tuning or selection; scored once).", { size: 8, color: COL.grey });
  f.table([{ label: "Model", key: "model", left: true, w: 4 }, { label: "RMSE", key: "rmse", fmt: f3 }, { label: "MAE", key: "mae", fmt: f3 }], e.finalSpatial, { highlight: (r) => (/^WINNER/.test(r.model) ? "win" : null) });
  f.para("Random: final hold-out (optimistic - cannot trigger a redo).", { size: 8, color: COL.grey });
  f.table([{ label: "Model", key: "model", left: true, w: 4 }, { label: "RMSE", key: "rmse", fmt: f3 }, { label: "MAE", key: "mae", fmt: f3 }, { label: "R2", key: "r2", fmt: f3 }], e.finalRandom, { highlight: (r) => (r.model.includes("production") ? "win" : null) });

  if (e.plots?.random?.actual_vs_pred || e.plots?.spatial?.actual_vs_pred) {
    f.section("Regressor and residual plots", { index: false });
    f.para(`Production model (${(e.plots.spatial?.actual_vs_pred || e.plots.random.actual_vs_pred).model}). Each plot uses a stored random sample of test points, not all rows. Dashed line = perfect prediction / zero residual.`, { size: 7.5, color: COL.grey });
    scatterPair(f, e, "Actual vs predicted error", (s) => ({ xs: s.y, ys: s.p }), "Actual error (m)", "Predicted (m)", (xr, yr) => { const lo = Math.max(xr[0], yr[0]), hi = Math.min(xr[1], yr[1]); return [[lo, lo], [hi, hi]]; });
    scatterPair(f, e, "Residual vs predicted", (s) => ({ xs: s.p, ys: s.y.map((v, j) => v - s.p[j]) }), "Predicted error (m)", "Residual (m)", (xr) => [[xr[0], 0], [xr[1], 0]]);
    histPair(f, e);
  }

  if (spatial) {
    f.section("Spatial validation", { index: false });
    if (spatial.validation_design) f.para(`Design: ${spatial.validation_design}`, { size: 7.5, color: COL.grey });
    if (spatial.cv_table) {
      f.para("Model tournament - 4-strip spatial cross-validation (metres).", { size: 8, color: COL.grey });
      f.table([{ label: "Model", key: "model", left: true, w: 3.4 }, { label: "RMSE", key: "RMSE", fmt: f2 }, { label: "MAE", key: "MAE", fmt: f2 }, { label: "Plains", key: "RMSE_plains", fmt: f2 }, { label: "Foothill", key: "RMSE_foothill", fmt: f2 }, { label: "Worst fold", key: "worst_fold_RMSE", fmt: f2 }],
        [...spatial.cv_table].sort((a, b) => a.RMSE - b.RMSE), { highlight: (r) => (r.model === spatial.winner ? "win" : null) });
    }
    if (spatial.frozen_table) {
      f.para("Frozen test strip (scored once).", { size: 8, color: COL.grey });
      f.table([{ label: "Model", key: "model", left: true, w: 3.4 }, { label: "RMSE", key: "RMSE", fmt: f2 }, { label: "MAE", key: "MAE", fmt: f2 }, { label: "Bias", key: "Bias", fmt: f2 }, { label: "Plains", key: "RMSE_plains", fmt: f2 }, { label: "Foothill", key: "RMSE_foothill", fmt: f2 }],
        spatial.frozen_table, { highlight: (r) => (/^WINNER/.test(r.model) ? "win" : null) });
    }
    if (spatial.interval?.groups) {
      f.para(`Prediction interval: nominal ${(spatial.interval.nominal * 100).toFixed(0)}%, covered ${(spatial.interval.frozen_coverage * 100).toFixed(1)}% on the frozen strip.`, { size: 8, color: COL.grey });
      f.table([{ label: "Terrain", key: "terrain", left: true }, { label: "Roughness", key: "roughness_tercile", left: true }, { label: "n", key: "n", fmt: (v) => Number(v).toLocaleString() }, { label: "q90 (m)", key: "q90_m", fmt: f2 }, { label: "Coverage", key: "coverage", fmt: (v) => `${(v * 100).toFixed(1)}%` }], spatial.interval.groups);
    }
    if (spatial.known_limits?.length) { f.h2("Known limits"); spatial.known_limits.forEach((l) => f.bullet(l, TONE.amber)); }
  }

  f.h2("Evaluation method notes");
  const dsg = m.design || {};
  f.bullet(`Cross-validation models were trained on at most ${(dsg.cv_train_cap || 0).toLocaleString()} rows per fold, SVR on ${(dsg.svr_train_cap || 0).toLocaleString()}, and slow models were scored on at most ${(dsg.slow_eval_cap || 0).toLocaleString()} rows; the dataset itself is used in full.`);
  f.bullet(`Spatial CV uses ${(m.split_sizes?.spatial_cv_rows || 0).toLocaleString()} rows (rows in the 5 km buffers are dropped). Fixed seed ${dsg.seed ?? "-"}.`);
  f.bullet(`${Object.entries(e.sources || {}).map(([k, v]) => `${v} result rows ${k}`).join("; ")}.`);
  f.bullet("Fit times marked * on screen may include idle time (the computer slept during the run) and are not reported here as compute cost.");
  void d; void M; void CW;
}

function rankedPair(f, rows, refs) {
  const d = f.doc, { M, CW } = f;
  const vals = rows.flatMap((r) => [r.a, r.b]).filter((v) => v != null);
  const lo = Math.floor((Math.min(...vals) - 0.02) * 10) / 10, hi = Math.ceil((Math.max(...vals) + 0.02) * 10) / 10;
  const colW = (CW - 8) / 2, lab = 40, val = 10, trackW = colW - lab - val - 2;
  const lists = [{ key: "a", title: "Random split", color: COL.amber, x: M, ref: refs?.a }, { key: "b", title: "Spatial split", color: COL.blue, x: M + colW + 8, ref: refs?.b }]
    .map((c) => ({ ...c, items: rows.filter((r) => r[c.key] != null).map((r) => ({ label: r.label, v: r[c.key], tag: r.tag })).sort((p, q) => p.v - q.v) }));
  const n = Math.max(...lists.map((l) => l.items.length));
  f.need(14 + n * 5.2 + 8); const top = f.y;
  lists.forEach((l) => {
    d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.setFillColor(...l.color); d.circle(l.x + 1.2, top - 1, 1, "F"); d.text(l.title, l.x + 4, top);
    const x0 = l.x + lab, px = (v) => x0 + ((v - lo) / (hi - lo)) * trackW;
    d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.grey);
    for (let t = lo; t <= hi + 1e-9; t += (hi - lo) <= 0.8 ? 0.1 : 0.2) d.text(t.toFixed(1), px(t), top + 4, { align: "center" });
    l.items.forEach((it, i) => {
      const yy = top + 8 + i * 5.2;
      d.setDrawColor(215, 220, 228); d.line(x0, yy - 1, x0 + trackW, yy - 1);
      if (l.ref != null && l.ref >= lo && l.ref <= hi) { d.setLineDashPattern([0.8, 0.8], 0); d.line(px(l.ref), yy - 3.4, px(l.ref), yy + 1.4); d.setLineDashPattern([], 0); }
      d.setFillColor(...l.color); d.circle(px(it.v), yy - 1, i === 0 ? 1.5 : 1.05, "F");
      d.setFont("helvetica", i === 0 ? "bold" : "normal"); d.setFontSize(7); d.setTextColor(...COL.ink);
      let t = `${i + 1}. ${clean(it.label)}${it.tag ? " *" : ""}`; while (d.getTextWidth(t) > lab - 2 && t.length > 6) t = t.slice(0, -2);
      d.text(t, l.x, yy); d.text(it.v.toFixed(3), l.x + colW, yy, { align: "right" });
    });
  });
  f.y = top + 8 + n * 5.2 + 1;
  d.setFont("helvetica", "italic"); d.setFontSize(6.5); d.setTextColor(...COL.grey);
  d.text(`Lowest error first. Axis starts at ${lo.toFixed(1)} m, not zero. * production model. Dashed line = predict-the-average baseline${refs?.a != null && refs.a > hi ? " (random: beyond the axis)" : ""}.`, M, f.y + 2);
  f.y += 8; void val;
}

const win = (vals, lo = 0.01, hi = 0.99) => { const a = quantile(vals, lo), b = quantile(vals, hi), pad = (b - a) * 0.08 || 1; return [a - pad, b + pad]; };
function plotBox(d, x, yTop, w, h, xr, yr, xl, yl) {
  d.setDrawColor(190, 198, 208); d.setLineWidth(0.2); d.rect(x, yTop, w, h);
  d.setFontSize(6); d.setTextColor(...COL.grey); d.setFont("helvetica", "normal");
  [0, 0.5, 1].forEach((t) => { d.text((xr[0] + t * (xr[1] - xr[0])).toFixed(1), x + t * w, yTop + h + 3, { align: "center" }); d.text((yr[0] + t * (yr[1] - yr[0])).toFixed(1), x - 1.5, yTop + h - t * h + 1, { align: "right" }); });
  d.setFontSize(6.5); d.text(xl, x + w / 2, yTop + h + 6.5, { align: "center" }); d.text(yl, x - 8, yTop + h / 2, { angle: 90, align: "center" });
}
function scatterPair(f, e, title, getXY, xl, yl, lineFn) {
  const d = f.doc, { M, CW } = f; f.need(76);
  d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(title, M, f.y); f.y += 4;
  const w = (CW - 28) / 2, h = 58, y = f.y;
  ["random", "spatial"].forEach((k, i) => {
    const s = e.plots[k]?.actual_vs_pred; if (!s) return;
    const { xs, ys } = getXY(s), x0 = M + 9 + i * (w + 17), xr = win(xs), yr = win(ys);
    plotBox(d, x0, y, w, h, xr, yr, xl, yl);
    if (lineFn) { const [a, b] = lineFn(xr, yr); d.setDrawColor(120, 130, 145); d.setLineDashPattern([1.2, 1.2], 0); d.line(x0 + ((a[0] - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((a[1] - yr[0]) / (yr[1] - yr[0])) * h, x0 + ((b[0] - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((b[1] - yr[0]) / (yr[1] - yr[0])) * h); d.setLineDashPattern([], 0); }
    d.setFillColor(...(k === "random" ? COL.blue : COL.blue.map((v) => v)));
    const step = Math.max(1, Math.ceil(xs.length / 800));      // at most about 800 dots per plot: same picture, smaller file
    xs.forEach((vx, j) => { if (j % step) return; const vy = ys[j]; if (vx < xr[0] || vx > xr[1] || vy < yr[0] || vy > yr[1]) return; d.circle(x0 + ((vx - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((vy - yr[0]) / (yr[1] - yr[0])) * h, 0.35, "F"); });
    d.setFontSize(7); d.setTextColor(...COL.grey); d.text(k === "random" ? "Random split" : "Spatial split", x0, y - 0.8);
  });
  f.y += h + 11;
}
function histPair(f, e) {
  const d = f.doc, { M, CW } = f; f.need(66);
  d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text("Residual distribution", M, f.y); f.y += 4;
  const w = (CW - 28) / 2, h = 46, y = f.y;
  ["random", "spatial"].forEach((k, i) => {
    const s = e.plots[k]?.actual_vs_pred; if (!s) return;
    const res = s.y.map((v, j) => v - s.p[j]), [lo, hi] = win(res, 0.005, 0.995), n = 30, bw = (hi - lo) / n, bins = new Array(n).fill(0);
    res.forEach((v) => { if (v >= lo && v < hi) bins[Math.min(n - 1, Math.floor((v - lo) / bw))] += 1; });
    const mx = Math.max(...bins) * 1.08, x0 = M + 9 + i * (w + 17);
    plotBox(d, x0, y, w, h, [lo, hi], [0, mx], "Residual (m)", "Points");
    d.setFillColor(...COL.blue); bins.forEach((c, j) => d.rect(x0 + (j / n) * w + 0.1, y + h - (c / mx) * h, w / n - 0.2, (c / mx) * h, "F"));
    const mean = res.reduce((a, b) => a + b, 0) / res.length, sd = Math.sqrt(res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length);
    d.setFontSize(6.5); d.setTextColor(...COL.grey); d.text(`${k === "random" ? "Random" : "Spatial"}: mean ${mean.toFixed(3)} m, SD ${sd.toFixed(2)} m`, x0, y - 0.8);
  });
  f.y += h + 10;
}
