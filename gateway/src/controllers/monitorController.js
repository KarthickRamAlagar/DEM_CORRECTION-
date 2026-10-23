export const monitorController = ({ health, metrics }) => ({
  health: async (req, res) => res.json(await health.snapshot()),
  pipeline: (req, res) => res.json(health.pipeline()),
  prom: async (req, res) => { res.set("Content-Type", metrics.registry.contentType); res.send(await metrics.registry.metrics()); },
  quality: (req, res) => { const r = health.readJson("data", "processed", "sdg", "quality", "report.json"); res.json(r.found ? r.data : { status: "No data", hint: "Run etl/quality/run_quality.py (patch 8b)." }); },
  lineage: (req, res) => { const r = health.readJson("data", "processed", "sdg", "lineage", "manifest.json"); res.json(r.found ? r.data : { status: "No data", hint: "Run etl/lineage/build_manifest.py (patch 8b)." }); },
  layers: (req, res) => { const r = health.readJson("data", "processed", "sdg", "quality", "metric_layers.json"); res.json(r.found ? r.data : { status: "No data", hint: "Written by patch 8b/8d." }); },
});
