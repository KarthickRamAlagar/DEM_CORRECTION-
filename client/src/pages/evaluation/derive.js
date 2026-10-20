// Turns the raw benchmark database payload (/api/benchmark/summary) into the
// tables and plain-English observations shown on the Evaluation page.
// Nothing here is typed in by hand: every number comes from the database.

const PROD = "LightGBM (tuned, production)";

export const MODEL_ORDER = [
  "Dummy Mean", "Linear Regression", "Ridge", "Lasso", "ElasticNet", "KNN", "SVR", "Decision Tree",
  "Bagging + Decision Tree", "Random Forest", "Extra Trees", "Gradient Boosting", "Hist Gradient Boosting",
  "LightGBM (default)", "CatBoost", PROD,
];

const pick = (rows, stage, protocol) => rows.filter((r) => r.stage === stage && r.protocol === protocol);
const pctBetter = (base, x) => ((base - x) / base) * 100;

export function buildEval(summary) {
  const { meta, results, folds, samples } = summary;
  const R = results;

  // ---- benchmark: one row per model with both protocols side by side
  const rand = Object.fromEntries(pick(R, "benchmark", "random").map((r) => [r.model, r]));
  const spat = Object.fromEntries(pick(R, "benchmark", "spatial").map((r) => [r.model, r]));
  const names = MODEL_ORDER.filter((m) => rand[m] || spat[m]);
  const bench = names.map((m) => {
    const a = rand[m], b = spat[m];
    const suspicious =
      a && b && a.fit_seconds && b.fit_seconds
        ? (a.fit_seconds / b.fit_seconds > 5 && a.fit_seconds > 1000 ? "random" : b.fit_seconds / a.fit_seconds > 5 && b.fit_seconds > 1000 ? "spatial" : null)
        : null;
    return {
      model: m,
      rRmse: a?.rmse, rMae: a?.mae, rR2: a?.r2, rFit: a?.fit_seconds,
      sRmse: b?.rmse, sMae: b?.mae, sR2: b?.r2, sFit: b?.fit_seconds,
      delta: a && b ? b.rmse - a.rmse : null,
      timingFlag: suspicious,
      isProd: m === PROD,
    };
  });

  // ---- ensembles
  const ensR = Object.fromEntries(pick(R, "ensembles", "random").map((r) => [r.model, r]));
  const ensS = Object.fromEntries(pick(R, "ensembles", "spatial").map((r) => [r.model, r]));
  const ensembles = Object.keys({ ...ensR, ...ensS }).map((m) => ({
    model: m, note: (ensR[m] || ensS[m]).note,
    rRmse: ensR[m]?.rmse, rMae: ensR[m]?.mae, rR2: ensR[m]?.r2,
    sRmse: ensS[m]?.rmse, sMae: ensS[m]?.mae, sR2: ensS[m]?.r2,
  }));

  // ---- feature configs
  const cfgNames = [...new Set(R.filter((r) => r.stage === "config").map((r) => r.config))];
  const configs = cfgNames.map((c) => {
    const rl = R.find((r) => r.stage === "config" && r.protocol === "random" && r.config === c && r.model === "LightGBM");
    const sl = R.find((r) => r.stage === "config" && r.protocol === "spatial" && r.config === c && r.model === "LightGBM");
    const sr = R.find((r) => r.stage === "config" && r.protocol === "spatial" && r.config === c && r.model === "Ridge");
    return {
      config: c, nFeat: (rl || sl)?.extra?.n_features,
      rLgbm: rl?.rmse, rLgbmR2: rl?.r2, sLgbm: sl?.rmse, sRidge: sr?.rmse, sFoot: sl?.extra?.foothill,
    };
  });

  // ---- feature selection (method x k) + baseline
  const fsR = R.filter((r) => r.stage === "featsel" && r.protocol === "random");
  const fsS = R.filter((r) => r.stage === "featsel" && r.protocol === "spatial");
  const isBase = (r) => /baseline/i.test(r.model) || /all.*features/i.test(r.model);
  const isK = (r) => /^k=/.test(r.config) && !isBase(r);
  const methods = [...new Set(fsR.filter(isK).map((r) => r.model))];
  const ks = [...new Set(fsR.filter(isK).map((r) => Number(r.config.slice(2))))].sort((a, b) => a - b);
  // the two protocols were stored with slightly different method spellings
  // (e.g. "Mutual Information" vs "MutualInfo"), so match on a normalised name
  const canon = (n) => { const c = String(n).toLowerCase().replace(/[^a-z0-9]/g, ""); return c.startsWith("mutualinfo") ? "mutualinfo" : c; };
  const get = (set, m, k) => set.find((r) => canon(r.model) === canon(m) && r.config === `k=${k}`)?.rmse;
  const featsel = methods.map((m) => ({
    method: m,
    cells: ks.map((k) => ({ k, random: get(fsR, m, k), spatial: get(fsS, m, k) })),
  }));
  const baseR = fsR.find(isBase);
  const baseS = fsS.find(isBase);

  // ---- tuning
  const tuning = pick(R, "tuning", "random").map((r) => ({ method: r.model, rmse: r.rmse, note: r.note }));

  // ---- final
  const finalRandom = pick(R, "final", "random").sort((a, b) => a.rmse - b.rmse);
  const finalSpatial = R.filter((r) => r.stage === "final" && r.protocol === "spatial" && r.config === "frozen").sort((a, b) => a.rmse - b.rmse);

  // ---- decision
  const decision = meta.decision || null;

  // ---- observations (derived)
  // ---- observations: short cards { tone, title, metric, text } - every number comes from the data
  const obs = [];
  const full = bench.filter((b) => b.model !== "Dummy Mean");
  const bestOf = (arr, key) => arr.filter((x) => x[key] != null).sort((a, b) => a[key] - b[key])[0];
  const bR = bestOf(full, "rRmse"), bS = bestOf(full, "sRmse");
  const prod = bench.find((b) => b.isProd);
  const dummy = bench.find((b) => b.model === "Dummy Mean");
  const nm = (m) => m.replace(", production", "");
  const rf = bench.find((b) => b.model === "Random Forest");
  const lgd = bench.find((b) => b.model === "LightGBM (default)");

  if (bR && bS)
    obs.push(
      bR.model !== bS.model
        ? { tone: "amber", title: "The ranking flips by test type", metric: `${nm(bR.model)} \u2192 ${nm(bS.model)}`, text: `Random split favours ${nm(bR.model)} (${bR.rRmse.toFixed(3)} m); spatial split favours ${nm(bS.model)} (${bS.sRmse.toFixed(3)} m).` }
        : { tone: "teal", title: "Same winner on both tests", metric: nm(bR.model), text: `Lowest error on the random and the spatial split.` }
    );
  if (prod && rf && prod.rR2 != null && prod.sR2 != null)
    obs.push({ tone: "amber", title: "New areas are harder", metric: `R\u00b2 ${prod.rR2.toFixed(2)} \u2192 ${prod.sR2.toFixed(2)}`, text: `Production model, random to spatial. Random Forest drops ${rf.rR2.toFixed(2)} \u2192 ${rf.sR2.toFixed(2)}.` });
  if (lgd && prod)
    obs.push({ tone: "teal", title: "Tuning pays off on new ground", metric: `${pctBetter(lgd.sRmse, prod.sRmse).toFixed(1)}% lower error`, text: `Tuned vs default LightGBM on the spatial test. On the random split it is ${(((prod.rRmse - lgd.rRmse) / lgd.rRmse) * 100).toFixed(1)}% worse.` });
  if (prod && dummy)
    obs.push({ tone: "amber", title: "Gain over a plain average", metric: `${pctBetter(dummy.sRmse, prod.sRmse).toFixed(1)}% spatial`, text: `${pctBetter(dummy.rRmse, prod.rRmse).toFixed(1)}% on the random split. Spatial R\u00b2 is ${prod.sR2.toFixed(2)}, so much of the error is still unexplained.` });
  const allS = [...full.map((b) => b.sRmse), ...ensembles.map((x) => x.sRmse)].filter((v) => v != null).sort((a, b) => a - b);
  if (allS.length >= 5)
    obs.push({ tone: "teal", title: "Top models are close", metric: `${(((allS[4] - allS[0]) / allS[0]) * 100).toFixed(1)}% spread`, text: `The best five spatial scores (${allS[0].toFixed(3)}\u2013${allS[4].toFixed(3)} m) barely differ. Data and features limit accuracy more than the algorithm.` });

  const fsSummary = {};
  for (const [proto, base] of [["random", baseR], ["spatial", baseS]]) {
    const cells = featsel.flatMap((f) => f.cells.map((c) => ({ method: f.method, k: c.k, v: c[proto] }))).filter((c) => c.v != null).sort((a, b) => a.v - b.v);
    if (cells.length && base) fsSummary[proto] = { best: cells[0], base: base.rmse, gainPct: pctBetter(base.rmse, cells[0].v) };
  }
  if (fsSummary.random || fsSummary.spatial) {
    const r = fsSummary.random, s2 = fsSummary.spatial;
    const maxGain = Math.max(...[r, s2].filter(Boolean).map((x) => x.gainPct));
    const lead = s2 && (!r || s2.gainPct >= r.gainPct) ? s2 : r;
    obs.push({
      tone: "teal",
      title: "Keep all 29 features",
      metric: `${Math.max(0, maxGain).toFixed(2)}% best gain`,
      text: `Best subset: ${lead.best.method}, k=${lead.best.k}${lead === s2 ? " (spatial)" : " (random)"}. ${maxGain >= 1 ? "That clears the 1% bar and deserves a closer look." : "Below the 1% bar, so a subset is not worth it."}`,
    });
  }
  if (tuning.length >= 3) {
    const tv = tuning.filter((t) => !/^Default/.test(t.method)).map((t) => t.rmse);
    obs.push({ tone: "teal", title: "Search method barely matters", metric: `${(((Math.max(...tv) - Math.min(...tv)) / Math.min(...tv)) * 100).toFixed(2)}% spread`, text: "Grid search, randomized search and Optuna end up within a whisker of each other." });
  }
  const raw = finalSpatial.find((r) => /^Raw/.test(r.model)), cb = finalSpatial.find((r) => /^Constant/.test(r.model)), win = finalSpatial.find((r) => /^WINNER/.test(r.model));
  if (raw && cb && win)
    obs.push({ tone: "green", title: "Held-out test strip", metric: `${win.rmse.toFixed(2)} m vs ${raw.rmse.toFixed(2)} m raw`, text: `${pctBetter(raw.rmse, win.rmse).toFixed(1)}% better than the raw DEM and ${pctBetter(cb.rmse, win.rmse).toFixed(1)}% better than a constant shift.` });
  const fr = finalRandom[0], frProd = finalRandom.find((r) => r.model === PROD);
  if (fr && frProd)
    obs.push({ tone: "amber", title: "Random hold-out is optimistic", metric: `${nm(fr.model)} ${fr.rmse.toFixed(3)} m`, text: `Best on that split, but it cannot change the spatial verdict. Production scores ${frProd.rmse.toFixed(3)} m there.` });

  // ---- plot samples
  const plots = {};
  for (const [k, v] of Object.entries(samples || {})) {
    const [protocol, model, kind] = k.split("|");
    (plots[protocol] ||= {})[kind] = { model, ...v };
  }

  // ---- method notes (all derived from meta / results)
  const sources = {};
  R.forEach((r) => { const k = r.source?.startsWith("imported") ? "imported from earlier runs" : "computed in this run"; sources[k] = (sources[k] || 0) + 1; });

  return { fsSummary, meta, bench, ensembles, configs, featsel, ks, baseR, baseS, tuning, finalRandom, finalSpatial, decision, obs, plots, sources, folds, prod };
}

// small stats helpers used by the plots
export const quantile = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
export function r2Score(y, p) {
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  const ssTot = y.reduce((a, b) => a + (b - m) ** 2, 0);
  const ssRes = y.reduce((a, b, i) => a + (b - p[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}
