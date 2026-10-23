import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";

export const requestId = (req, res, next) => { req.id = crypto.randomUUID(); res.setHeader("X-Request-Id", req.id); next(); };

export const security = (cfg) => [
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  cors({ origin: (origin, cb) => cb(null, !origin || cfg.origins.includes(origin)), methods: ["GET", "POST", "OPTIONS"], maxAge: 600 }),
];

const limiter = (max, message, store) => rateLimit({
  windowMs: 60_000, limit: max, standardHeaders: "draft-7", legacyHeaders: false, store,
  handler: (req, res) => res.status(429).json({ error: message, request_id: req.id }),
});
export const generalLimiter = (cfg, store) => limiter(cfg.RATE_LIMIT_PER_MIN, "Too many requests. Please wait a minute.", store);
export const heavyLimiter = (cfg, store) => limiter(cfg.HEAVY_RATE_LIMIT_PER_MIN, "Too many map requests. Please wait a minute.", store);
