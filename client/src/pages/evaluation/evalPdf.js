// Evaluation report PDF (white pages, dark app-colour border, app name as the logo,
// page numbers bottom-centre, last page with developer icons). Built with jsPDF.
import { jsPDF } from "jspdf";
import { DEVELOPER_GITHUB_URL, DEVELOPER_LINKEDIN_URL, makeIconPng } from "../../lib/developerLinks";
import { quantile } from "./derive";
import { decisionCopy } from "./copy";

export const APP_NAME = "AETHER GIS"; // shown as the logo text on every page

const TEAL = [37, 99, 235]; // page accent (blue)
const AMBER = [180, 112, 12]; // random split
const INK = [15, 23, 42];
const GREY = [110, 118, 130];
const BORDER = [8, 9, 11]; // the application's (dark) background colour
const BLUE = [37, 99, 235]; // spatial split
const RED = [185, 28, 28];
const GREEN = [21, 128, 61];

const clean = (t) => String(t).replace(/\u00b2/g, "2").replace(/\u2192/g, "to").replace(/\u2013/g, "-");
const f3 = (v) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(3));
const f2 = (v) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(2));

export function generateEvalPdf({ e, spatial }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const CW = W - 2 * M;
  const TOP = 24;
  const BOTTOM = 268;
  const today = new Date();
  const generatedOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let y = TOP;

  const chrome = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(1.2);
    doc.rect(5, 5, W - 10, H - 10);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text(APP_NAME, M, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(generatedOn, W - M, 13, { align: "right" });
    doc.setDrawColor(...TEAL);
    doc.line(M, 16, W - M, 16);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${APP_NAME}  Model Evaluation Report`, M, 285);
  };
  const newPage = () => { doc.addPage(); chrome(); y = TOP; };
  const need = (h) => { if (y + h > BOTTOM) newPage(); };

  const h1 = (t) => { need(14); doc.setFont("times", "bold"); doc.setFontSize(17); doc.setTextColor(...INK); doc.text(t, M, y); y += 8; };
  const h2 = (t) => {
    need(32); y += 3;
    doc.setFont("times", "bold"); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(t, M, y);
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.5); doc.line(M, y + 1.6, M + 14, y + 1.6); doc.setLineWidth(0.2);
    y += 6.5;
  };
  const para = (t, { size = 8.5, color = [60, 66, 78], italic = false, gap = 1.5 } = {}) => {
    doc.setFont("helvetica", italic ? "italic" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(t), CW);
    lines.forEach((ln) => { need(size * 0.45 + 1); doc.text(ln, M, y); y += size * 0.45 + 0.8; });
    y += gap;
  };
  const bullet = (t, color = TEAL) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(clean(t), CW - 6);
    need(lines.length * 4.2 + 1);
    doc.setFillColor(...color); doc.circle(M + 1.2, y - 1, 0.9, "F");
    doc.setTextColor(60, 66, 78);
    lines.forEach((ln) => { doc.text(ln, M + 5, y); y += 4.1; });
    y += 1;
  };

  // columns: [{label, w (relative), left, fmt(v,row)}]
  const table = (cols, rows, { highlight, size = 7.5, rowH = 5 } = {}) => {
    const tw = cols.reduce((a, c) => a + (c.w || 1), 0);
    const xs = []; let acc = M;
    cols.forEach((c) => { xs.push(acc); acc += ((c.w || 1) / tw) * CW; });
    const widths = cols.map((c) => ((c.w || 1) / tw) * CW);
    const head = () => {
      need(rowH * 2);
      doc.setFillColor(240, 244, 248); doc.rect(M, y - 3.6, CW, rowH, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(...INK);
      cols.forEach((c, i) => doc.text(c.label, c.left ? xs[i] + 1 : xs[i] + widths[i] - 1, y, { align: c.left ? "left" : "right" }));
      y += rowH;
    };
    head();
    rows.forEach((r) => {
      if (y + rowH > BOTTOM) { newPage(); head(); }
      const h = highlight ? highlight(r) : null;
      if (h === "win") { doc.setFillColor(214, 244, 238); doc.rect(M, y - 3.6, CW, rowH, "F"); }
      doc.setFont("helvetica", h === "win" ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...INK);
      cols.forEach((c, i) => {
        let t = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
        t = t == null ? "-" : clean(t);
        if (c.left) { while (doc.getTextWidth(t) > widths[i] - 2 && t.length > 4) t = t.slice(0, -2); doc.text(t, xs[i] + 1, y); }
        else doc.text(t, xs[i] + widths[i] - 1, y, { align: "right" });
      });
      doc.setDrawColor(225, 229, 235); doc.line(M, y + 1.4, M + CW, y + 1.4);
      y += rowH;
    });
    y += 3;
  };

  const kpi = (items) => {
    need(20);
    const n = items.length, gap = 3, w = (CW - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = M + i * (w + gap);
      doc.setDrawColor(210, 216, 224); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, w, 17, 2, 2, "FD");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text(it.label.toUpperCase(), x + 3, y + 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...(it.color || INK)); doc.text(String(it.value), x + 3, y + 11.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GREY);
      const sub = doc.splitTextToSize(String(it.sub || ""), w - 5)[0] || "";
      doc.text(sub, x + 3, y + 15.2);
    });
    y += 21;
  };

  // paired horizontal bars (random = blue, spatial = teal)
  // ranked dot plot (lowest error first): random on the left, spatial on the right
  const rankedPair = (rows, refs) => {
    const vals = rows.flatMap((r) => [r.a, r.b]).filter((v) => v != null);
    const lo = Math.floor((Math.min(...vals) - 0.02) * 10) / 10, hi = Math.ceil((Math.max(...vals) + 0.02) * 10) / 10;
    const colW = (CW - 8) / 2, lab = 40, val = 10, trackW = colW - lab - val - 2;
    const lists = [
      { key: "a", title: "Random split", color: AMBER, x: M, ref: refs?.a },
      { key: "b", title: "Spatial split", color: BLUE, x: M + colW + 8, ref: refs?.b },
    ].map((c) => ({ ...c, items: rows.filter((r) => r[c.key] != null).map((r) => ({ label: r.label, v: r[c.key], tag: r.tag })).sort((p, q) => p.v - q.v) }));
    const n = Math.max(...lists.map((l) => l.items.length));
    need(14 + n * 5.2 + 8);
    const top = y;
    lists.forEach((l) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK);
      doc.setFillColor(...l.color); doc.circle(l.x + 1.2, top - 1, 1, "F"); doc.text(l.title, l.x + 4, top);
      const x0 = l.x + lab, px = (v) => x0 + ((v - lo) / (hi - lo)) * trackW;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GREY);
      for (let t = lo; t <= hi + 1e-9; t += (hi - lo) <= 0.8 ? 0.1 : 0.2) doc.text(t.toFixed(1), px(t), top + 4, { align: "center" });
      l.items.forEach((it, i) => {
        const yy = top + 8 + i * 5.2;
        doc.setDrawColor(215, 220, 228); doc.line(x0, yy - 1, x0 + trackW, yy - 1);
        if (l.ref && l.ref.value >= lo && l.ref.value <= hi) { doc.setLineDashPattern([0.8, 0.8], 0); doc.line(px(l.ref.value), yy - 3.4, px(l.ref.value), yy + 1.4); doc.setLineDashPattern([], 0); }
        doc.setFillColor(...l.color); doc.circle(px(it.v), yy - 1, i === 0 ? 1.5 : 1.05, "F");
        doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.setFontSize(7); doc.setTextColor(...INK);
        let t = `${i + 1}. ${it.label}${it.tag ? " *" : ""}`;
        while (doc.getTextWidth(t) > lab - 2 && t.length > 6) t = t.slice(0, -2);
        doc.text(t, l.x, yy);
        doc.text(it.v.toFixed(3), l.x + colW, yy, { align: "right" });
      });
    });
    y = top + 8 + n * 5.2 + 1;
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); doc.setTextColor(...GREY);
    doc.text(`Lowest error first. Axis starts at ${lo.toFixed(1)} m, not zero. * production model. Dashed line = predict-the-average baseline${refs?.a && refs.a.value > hi ? " (random: beyond the axis)" : ""}.`, M, y + 2);
    y += 6;
  };

  // scatter / histogram drawn with primitives
  const win = (vals, lo = 0.01, hi = 0.99) => { const a = quantile(vals, lo), b = quantile(vals, hi), pad = (b - a) * 0.08 || 1; return [a - pad, b + pad]; };
  const plotBox = (x, yTop, w, h, xr, yr, xl, yl) => {
    doc.setDrawColor(190, 198, 208); doc.setLineWidth(0.2); doc.rect(x, yTop, w, h);
    doc.setFontSize(6); doc.setTextColor(...GREY); doc.setFont("helvetica", "normal");
    [0, 0.5, 1].forEach((t) => {
      doc.text((xr[0] + t * (xr[1] - xr[0])).toFixed(1), x + t * w, yTop + h + 3, { align: "center" });
      doc.text((yr[0] + t * (yr[1] - yr[0])).toFixed(1), x - 1.5, yTop + h - t * h + 1, { align: "right" });
    });
    doc.setFontSize(6.5); doc.text(xl, x + w / 2, yTop + h + 6.5, { align: "center" });
    doc.text(yl, x - 8, yTop + h / 2, { angle: 90, align: "center" });
  };
  const scatterPair = (title, getXY, xl, yl, lineFn) => {
    need(76);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(title, M, y); y += 4;
    const w = (CW - 28) / 2, h = 58;
    ["random", "spatial"].forEach((k, i) => {
      const s = e.plots[k]?.actual_vs_pred; if (!s) return;
      const { xs, ys } = getXY(s);
      const x0 = M + 9 + i * (w + 17);
      const xr = win(xs), yr = win(ys);
      plotBox(x0, y, w, h, xr, yr, xl, yl);
      if (lineFn) { const [a, b] = lineFn(xr, yr); doc.setDrawColor(120, 130, 145); doc.setLineDashPattern([1.2, 1.2], 0); doc.line(x0 + ((a[0] - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((a[1] - yr[0]) / (yr[1] - yr[0])) * h, x0 + ((b[0] - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((b[1] - yr[0]) / (yr[1] - yr[0])) * h); doc.setLineDashPattern([], 0); }
      doc.setFillColor(...(k === "random" ? BLUE : TEAL));
      xs.forEach((vx, j) => {
        const vy = ys[j]; if (vx < xr[0] || vx > xr[1] || vy < yr[0] || vy > yr[1]) return;
        doc.circle(x0 + ((vx - xr[0]) / (xr[1] - xr[0])) * w, y + h - ((vy - yr[0]) / (yr[1] - yr[0])) * h, 0.35, "F");
      });
      doc.setFontSize(7); doc.setTextColor(...GREY); doc.text(k === "random" ? "Random split" : "Spatial split", x0, y - 0.8);
    });
    y += h + 11;
  };
  const histPair = () => {
    need(66);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text("Residual distribution", M, y); y += 4;
    const w = (CW - 28) / 2, h = 46;
    ["random", "spatial"].forEach((k, i) => {
      const s = e.plots[k]?.actual_vs_pred; if (!s) return;
      const res = s.y.map((v, j) => v - s.p[j]);
      const [lo, hi] = win(res, 0.005, 0.995); const n = 30, bw = (hi - lo) / n;
      const bins = new Array(n).fill(0); res.forEach((v) => { if (v >= lo && v < hi) bins[Math.min(n - 1, Math.floor((v - lo) / bw))] += 1; });
      const mx = Math.max(...bins) * 1.08;
      const x0 = M + 9 + i * (w + 17);
      plotBox(x0, y, w, h, [lo, hi], [0, mx], "Residual (m)", "Points");
      doc.setFillColor(...(k === "random" ? BLUE : TEAL));
      bins.forEach((c, j) => doc.rect(x0 + (j / n) * w + 0.1, y + h - (c / mx) * h, w / n - 0.2, (c / mx) * h, "F"));
      const mean = res.reduce((a, b) => a + b, 0) / res.length;
      const sd = Math.sqrt(res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length);
      doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text(`${k === "random" ? "Random" : "Spatial"}: mean ${mean.toFixed(3)} m, SD ${sd.toFixed(2)} m`, x0, y - 0.8);
    });
    y += h + 10;
  };

  // ============================= PAGE 1 =============================
  chrome();
  doc.setFont("times", "bold"); doc.setFontSize(24); doc.setTextColor(...INK);
  doc.text("Model evaluation report", M, y + 5); y += 11;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(...GREY);
  doc.text("How well the CartoDEM elevation correction works on ground it has never seen", M, y); y += 7;
  const m = e.meta;
  para(`Data: ${(m.n_rows_total || 0).toLocaleString()} rows (golden dataset)${m.self_test_subsample ? " - SELF-TEST SUBSAMPLE, NOT REAL RESULTS" : ""}. Last run: ${m.last_run_utc ? new Date(m.last_run_utc).toLocaleString() : "-"}. Target: elevation error = reference - raw DEM.`, { size: 8, color: GREY });

  const d = e.decision;
  if (d) {
    const cp = decisionCopy(d, e);
    h2("Decision");
    const col = d.redo_pipeline ? RED : GREEN;
    need(60);
    doc.setDrawColor(...col); doc.setLineWidth(0.5); doc.roundedRect(M, y, CW, 47, 2, 2); doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...col); doc.text(cp.badge, M + 4, y + 5.5);
    doc.setFont("times", "bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text(cp.headline, M + 4, y + 12.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 66, 78);
    doc.text(clean(cp.sub), M + 4, y + 17.5);
    const bw = (CW - 8 - 2 * (cp.cards.length - 1) * 2) / cp.cards.length;
    cp.cards.forEach((c, i) => {
      const bx = M + 4 + i * (bw + 4);
      doc.setDrawColor(200, 205, 214); doc.roundedRect(bx, y + 20.5, bw, 23.5, 1.2, 1.2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text(clean(c.label), bx + 2, y + 24);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(clean(c.title), bw - 4).slice(0, 2), bx + 2, y + 28);
      doc.setFontSize(8.5); doc.setTextColor(...TEAL); doc.text(clean(c.value), bx + 2, y + 36);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(60, 66, 78); doc.text(doc.splitTextToSize(clean(c.text), bw - 4).slice(0, 2), bx + 2, y + 39.5);
    });
    doc.setDrawColor(...INK);
    y += 51;
    kpi([
      { label: "Production, spatial test", value: `${f3(d.production_spatial_rmse)} m`, sub: "tuned LightGBM, 29 features", color: TEAL },
      { label: "Best alternative", value: `${f3(d.best_spatial_rmse)} m`, sub: "spatial test" },
      { label: "Improvement", value: `${d.best_spatial_margin_pct.toFixed(2)}%`, sub: `${cp.threshold}% needed to switch`, color: col },
      { label: "Rows evaluated", value: d.n_rows_used.toLocaleString(), sub: d.valid_for_decision ? "full dataset" : "NOT valid" },
    ]);
  }
  h2("What the results tell us");
  e.obs.forEach((o) => bullet(clean(`${o.title} (${o.metric}). ${o.text}`), o.tone === "amber" ? [217, 119, 6] : o.tone === "red" ? RED : o.tone === "green" ? GREEN : TEAL));

  // ============================= SECTION 1 TABLES =============================
  newPage(); h1("Section 1: Benchmark study");
  h2("Model benchmark");
  para("Errors in metres. Random = 4-fold random split; spatial = 10 km blocks with a 5 km buffer. Highlighted row = production model.", { size: 7.5, color: GREY });
  table(
    [
      { label: "Model", key: "model", left: true, w: 3.4 },
      { label: "Rand RMSE", key: "rRmse", fmt: f3 }, { label: "Rand R2", key: "rR2", fmt: f3 },
      { label: "Spat RMSE", key: "sRmse", fmt: f3 }, { label: "Spat R2", key: "sR2", fmt: f3 },
      { label: "Spat-Rand", key: "delta", fmt: (v) => (v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(3)) },
    ],
    e.bench, { highlight: (r) => (r.isProd ? "win" : null) }
  );
  {
    const dm = e.bench.find((b) => b.model === "Dummy Mean");
    const rows = e.bench.filter((b) => b.model !== "Dummy Mean").map((b) => ({ label: b.model.replace(", production", ""), a: b.rRmse, b: b.sRmse, tag: b.isProd }));
    h2("Ranking by error");
    rankedPair(rows, dm ? { a: { value: dm.rRmse }, b: { value: dm.sRmse } } : null);
  }

  h2("Ensembles");
  table(
    [
      { label: "Ensemble", key: "model", left: true, w: 4 },
      { label: "Rand RMSE", key: "rRmse", fmt: f3 }, { label: "Spat RMSE", key: "sRmse", fmt: f3 }, { label: "Spat R2", key: "sR2", fmt: f3 },
      { label: "vs prod", key: "gain", fmt: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`) },
    ],
    e.ensembles.map((x) => ({ ...x, gain: x.sRmse != null && e.prod?.sRmse ? ((e.prod.sRmse - x.sRmse) / e.prod.sRmse) * 100 : null }))
  );

  h2("Feature configurations");
  table(
    [
      { label: "Feature set", key: "config", left: true, w: 2.6 }, { label: "# feat", key: "nFeat" },
      { label: "LGBM random", key: "rLgbm", fmt: f3 }, { label: "LGBM spatial", key: "sLgbm", fmt: f3 }, { label: "Ridge spatial", key: "sRidge", fmt: f3 }, { label: "Foothill", key: "sFoot", fmt: f3 },
    ],
    e.configs, { highlight: (r) => (r.config === "F29_parity_safe" ? "win" : null) }
  );

  h2("Feature selection");
  const fsRows = e.featsel.map((f) => {
    const best = (p) => f.cells.filter((c) => c[p] != null).sort((a, b) => a[p] - b[p])[0];
    const br = best("random"), bs = best("spatial");
    return { method: f.method, rk: br ? `k=${br.k}` : "-", r: br?.random, sk: bs ? `k=${bs.k}` : "-", s: bs?.spatial };
  });
  table(
    [{ label: "Method", key: "method", left: true, w: 2.6 }, { label: "Best k (rand)", key: "rk" }, { label: "RMSE", key: "r", fmt: f3 }, { label: "Best k (spat)", key: "sk" }, { label: "RMSE", key: "s", fmt: f3 }],
    fsRows
  );
  para(`All 29 features (baseline): ${f3(e.baseR?.rmse)} m random, ${f3(e.baseS?.rmse)} m spatial.` + (e.fsSummary?.spatial ? ` Best subset under spatial CV: ${e.fsSummary.spatial.best.method} k=${e.fsSummary.spatial.best.k} at ${f3(e.fsSummary.spatial.best.v)} m (${e.fsSummary.spatial.gainPct.toFixed(2)}% vs all 29, ${e.fsSummary.spatial.gainPct < 1 ? "below" : "above"} the 1% bar).` : ""), { size: 8 });

  h2("Settings search");
  table([{ label: "Method", key: "method", left: true, w: 3 }, { label: "CV RMSE", key: "rmse", fmt: f3 }], e.tuning);

  h2("Final test");
  para("Spatial: frozen test strip (never used for fitting, tuning or selection; scored once).", { size: 8, color: GREY });
  table([{ label: "Model", key: "model", left: true, w: 4 }, { label: "RMSE", key: "rmse", fmt: f3 }, { label: "MAE", key: "mae", fmt: f3 }], e.finalSpatial, { highlight: (r) => (/^WINNER/.test(r.model) ? "win" : null) });
  para("Random: final hold-out (optimistic - cannot trigger a redo).", { size: 8, color: GREY });
  table([{ label: "Model", key: "model", left: true, w: 4 }, { label: "RMSE", key: "rmse", fmt: f3 }, { label: "MAE", key: "mae", fmt: f3 }, { label: "R2", key: "r2", fmt: f3 }], e.finalRandom, { highlight: (r) => (r.model.includes("production") ? "win" : null) });

  // ============================= PLOTS =============================
  if (e.plots.random?.actual_vs_pred || e.plots.spatial?.actual_vs_pred) {
    newPage();
    h1("Regressor and residual plots");
    para(`Production model (${(e.plots.spatial?.actual_vs_pred || e.plots.random.actual_vs_pred).model}). Each plot uses a stored random sample of test points, not all rows. Dashed line = perfect prediction / zero residual.`, { size: 7.5, color: GREY });
    scatterPair("Actual vs predicted error", (s) => ({ xs: s.y, ys: s.p }), "Actual error (m)", "Predicted (m)", (xr, yr) => { const lo = Math.max(xr[0], yr[0]), hi = Math.min(xr[1], yr[1]); return [[lo, lo], [hi, hi]]; });
    scatterPair("Residual vs predicted", (s) => ({ xs: s.p, ys: s.y.map((v, j) => v - s.p[j]) }), "Predicted error (m)", "Residual (m)", (xr) => [[xr[0], 0], [xr[1], 0]]);
    histPair();
  }

  // ============================= SECTION 2 =============================
  if (spatial) {
    need(30);
    y += 1; h1("Section 2: Spatial validation");
    if (spatial.validation_design) para(`Design: ${spatial.validation_design}`, { size: 7.5, color: GREY });
    if (spatial.cv_table) {
      para("Model tournament - 4-strip spatial cross-validation (metres).", { size: 8, color: GREY });
      table(
        [{ label: "Model", key: "model", left: true, w: 3.4 }, { label: "RMSE", key: "RMSE", fmt: f2 }, { label: "MAE", key: "MAE", fmt: f2 }, { label: "Plains", key: "RMSE_plains", fmt: f2 }, { label: "Foothill", key: "RMSE_foothill", fmt: f2 }, { label: "Worst fold", key: "worst_fold_RMSE", fmt: f2 }],
        [...spatial.cv_table].sort((a, b) => a.RMSE - b.RMSE), { highlight: (r) => (r.model === spatial.winner ? "win" : null) }
      );
    }
    if (spatial.frozen_table) {
      para("Frozen test strip (scored once).", { size: 8, color: GREY });
      table(
        [{ label: "Model", key: "model", left: true, w: 3.4 }, { label: "RMSE", key: "RMSE", fmt: f2 }, { label: "MAE", key: "MAE", fmt: f2 }, { label: "Bias", key: "Bias", fmt: f2 }, { label: "Plains", key: "RMSE_plains", fmt: f2 }, { label: "Foothill", key: "RMSE_foothill", fmt: f2 }],
        spatial.frozen_table, { highlight: (r) => (/^WINNER/.test(r.model) ? "win" : null) }
      );
    }
    if (spatial.interval?.groups) {
      para(`Prediction interval: nominal ${(spatial.interval.nominal * 100).toFixed(0)}%, covered ${(spatial.interval.frozen_coverage * 100).toFixed(1)}% on the frozen strip.`, { size: 8, color: GREY });
      table(
        [{ label: "Terrain", key: "terrain", left: true }, { label: "Roughness", key: "roughness_tercile", left: true }, { label: "n", key: "n", fmt: (v) => Number(v).toLocaleString() }, { label: "q90 (m)", key: "q90_m", fmt: f2 }, { label: "Coverage", key: "coverage", fmt: (v) => `${(v * 100).toFixed(1)}%` }],
        spatial.interval.groups
      );
    }
    if (spatial.known_limits?.length) { h2("Known limits"); spatial.known_limits.forEach((l) => bullet(l, [217, 119, 6])); }
  }

  // ============================= NOTES =============================
  h2("Method notes");
  const dsg = m.design || {};
  bullet(`Cross-validation models were trained on at most ${(dsg.cv_train_cap || 0).toLocaleString()} rows per fold, SVR on ${(dsg.svr_train_cap || 0).toLocaleString()}, and slow models were scored on at most ${(dsg.slow_eval_cap || 0).toLocaleString()} rows; the dataset itself is used in full.`);
  bullet(`Spatial CV uses ${(m.split_sizes?.spatial_cv_rows || 0).toLocaleString()} rows (rows in the 5 km buffers are dropped). Fixed seed ${dsg.seed ?? "-"}.`);
  bullet(Object.entries(e.sources).map(([k, v]) => `${v} result rows ${k}`).join("; ") + ".");
  bullet("Fit times marked * on screen may include idle time (the computer slept during the run) and are not reported here as compute cost.");

  // ============================= LAST PAGE =============================
  if (y > 255) newPage();
  const ICON_MM = 5, footY = 285, iconTop = footY - ICON_MM + 1.2;
  const githubX = W - M - ICON_MM, linkedinX = githubX - 2.5 - ICON_MM;
  const li = makeIconPng("linkedin"), gh = makeIconPng("github");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
  doc.text("Developed by", linkedinX - 2.5, footY, { align: "right" });
  if (li) { doc.addImage(li, "PNG", linkedinX, iconTop, ICON_MM, ICON_MM); if (DEVELOPER_LINKEDIN_URL) doc.link(linkedinX, iconTop, ICON_MM, ICON_MM, { url: DEVELOPER_LINKEDIN_URL }); }
  if (gh) { doc.addImage(gh, "PNG", githubX, iconTop, ICON_MM, ICON_MM); doc.link(githubX, iconTop, ICON_MM, ICON_MM, { url: DEVELOPER_GITHUB_URL }); }
  doc.setDrawColor(200, 200, 200); doc.line(M, 266, W - M, 266);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
  doc.text("This report presents results stored by the DEM-Correction benchmark. Please cross-verify them, as results can contain errors.", M, 273, { maxWidth: CW });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text(`${String(i).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W / 2, 291, { align: "center" });
  }
  doc.save("dem-correction-evaluation-report.pdf");
}
