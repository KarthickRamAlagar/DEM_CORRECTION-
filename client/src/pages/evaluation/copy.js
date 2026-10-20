// Short wording for the model decision, shared by the page and the PDF.
// All numbers come from the stored decision record and the benchmark rows.

const clean = (m) => (m || "").replace(", production", "");

export function decisionCopy(d, e) {
  const m = /(?:>=|at least)\s*([\d.]+)\s*%/i.exec(d.rule || "");
  const threshold = m ? Number(m[1]) : 1;
  const gain = d.best_spatial_margin_pct;
  const singles = (e?.bench || []).filter((b) => b.model !== "Dummy Mean" && b.rRmse != null);
  const bestRandom = [...singles].sort((a, b) => a.rRmse - b.rRmse)[0];
  const redo = !!d.redo_pipeline;
  const winner = redo ? clean(d.best_spatial_model) : "LightGBM (tuned)";
  const winRmse = redo ? d.best_spatial_rmse : d.production_spatial_rmse;
  const cards = [
    {
      label: "Closest rival",
      title: clean(d.best_spatial_model),
      value: `${d.best_spatial_rmse.toFixed(3)} m`,
      text: redo ? `${gain.toFixed(2)}% better. Clears the ${threshold}% bar.` : `Only ${gain.toFixed(2)}% better. We needed ${threshold}% to switch.`,
    },
    {
      label: "How it was judged",
      title: "Spatial split",
      value: "New areas",
      text: "Whole areas are held out, like real use.",
    },
  ];
  if (bestRandom)
    cards.push({
      label: "Best on random split",
      title: clean(bestRandom.model),
      value: `${bestRandom.rRmse.toFixed(3)} m`,
      text: "Neighbouring points flatter every model. Shown for comparison only.",
    });
  return {
    threshold,
    badge: redo ? "Re-evaluation recommended" : "Production model confirmed",
    winner,
    headline: `${winner} wins`,
    sub: `Best single model on unseen areas · ${winRmse.toFixed(3)} m RMSE`,
    cards,
  };
}
