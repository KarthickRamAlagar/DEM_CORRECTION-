import crypto from "node:crypto";
import rateLimit from "express-rate-limit";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Developer-only routes: /__monitor/<MONITOR_SECRET>/...
// - Anything wrong (secret, machine, switched off) answers the same 404 as a path that does not exist.
// - This is a shared secret, not a login system.
export const monitorGuard = (cfg) => [
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: false, legacyHeaders: false, skipSuccessfulRequests: true, handler: (req, res) => res.status(404).json({ error: "Not found" }) }),
  (req, res, next) => {
    const ok = cfg.monitorOn && same(req.params.secret, cfg.MONITOR_SECRET) && (cfg.MONITOR_ALLOW_REMOTE === "1" || LOOPBACK.has(req.ip));
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex");
    next();
  },
];
