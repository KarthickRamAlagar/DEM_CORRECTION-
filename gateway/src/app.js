import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requestId, security, generalLimiter, heavyLimiter } from "./middleware/security.js";
import { createMetrics, requestMetrics } from "./services/metricsService.js";
import { createCache } from "./services/cacheService.js";
import { createUpstream } from "./repositories/upstreamRepository.js";
import { createSdgService } from "./services/sdgService.js";
import { createHealthService } from "./services/healthService.js";
import { createServicesService } from "./services/servicesService.js";
import { sdgRoutes } from "./routes/sdgRoutes.js";
import { monitorRoutes } from "./routes/monitorRoutes.js";

const MAX_BODY = 5 * 1024 * 1024;

export async function createApp(cfg) {
  const app = express();
  app.disable("x-powered-by"); app.set("trust proxy", "loopback");
  const metrics = createMetrics(), cache = await createCache({ redisUrl: cfg.REDIS_URL, ttlSeconds: cfg.CACHE_TTL_SECONDS, metrics });
  const upstream = createUpstream(cfg.UPSTREAM_URL, { onError: metrics.upstreamError });
  const sdg = createSdgService({ upstream, cache }), services = createServicesService({ cfg, metrics }), health = createHealthService({ cfg, upstream, metrics, cache, services });

  app.use(requestId, ...security(cfg), requestMetrics(metrics));
  app.get("/healthz", (req, res) => res.json({ ok: true }));
  if (cfg.monitorOn) app.use("/__monitor/:secret", monitorRoutes({ cfg, health, metrics }));

  const general = generalLimiter(cfg), heavy = heavyLimiter(cfg);
  app.use("/api", general, (req, res, next) => {
    if (!["GET", "POST", "OPTIONS"].includes(req.method)) return res.status(405).json({ error: "Method not allowed", request_id: req.id });
    if (Number(req.headers["content-length"] || 0) > MAX_BODY) return res.status(413).json({ error: "Request too large", request_id: req.id });
    next();
  });
  app.use("/api/sdg", sdgRoutes({ sdg, heavy }));
  // everything else under /api goes straight through to FastAPI (streamed, nothing stored)
  app.use("/api", createProxyMiddleware({
    target: cfg.UPSTREAM_URL, changeOrigin: false, proxyTimeout: 180_000, timeout: 180_000,
    pathRewrite: (p, req) => req.originalUrl,
    on: { error: (err, req, res) => { metrics.upstreamError(); if (!res.headersSent) { res.writeHead?.(502, { "Content-Type": "application/json" }); } res.end?.(JSON.stringify({ error: "The analysis service did not answer.", request_id: req.id })); } },
  }));
  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: "Something went wrong.", request_id: req.id }));
  return { app, cache, metrics };
}
