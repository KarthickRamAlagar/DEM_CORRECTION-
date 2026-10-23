import { Router } from "express";
import { validateQuery } from "../middleware/validate.js";
import { sdgController } from "../controllers/sdgController.js";
import * as S from "../schemas/sdg.js";

// Validated and cached SDG routes. Everything else under /api is passed through by the proxy in app.js.
export function sdgRoutes({ sdg, heavy }) {
  const r = Router(), c = sdgController(sdg);
  r.get("/chain/scenario", heavy, validateQuery(S.scenarioQuery), c("/chain/scenario"));
  r.get("/chain/point", validateQuery(S.pointQuery), c("/chain/point"));
  r.get("/chain/region", heavy, validateQuery(S.regionQuery), c("/chain/region"));
  r.get("/chain/scene", heavy, validateQuery(S.sceneQuery), c("/chain/scene"));
  r.get("/context/admin1", validateQuery(S.admin1Query), c("/context/admin1"));
  r.get("/context/crops", validateQuery(S.emptyQuery), c("/context/crops"));
  return r;
}
