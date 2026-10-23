import { Router } from "express";
import { monitorGuard } from "../middleware/monitorGuard.js";
import { monitorController } from "../controllers/monitorController.js";

export function monitorRoutes({ cfg, health, metrics }) {
  const r = Router({ mergeParams: true }), c = monitorController({ health, metrics });
  r.use(monitorGuard(cfg));
  r.get("/health", c.health); r.get("/pipeline", c.pipeline); r.get("/metrics", c.prom);
  r.get("/quality", c.quality); r.get("/lineage", c.lineage); r.get("/layers", c.layers);
  r.use((req, res) => res.status(404).json({ error: "Not found" }));
  return r;
}
