import client from "prom-client";

// Prometheus numbers plus a small in-memory window the hidden health route reads (latency and error rate).
export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: "gw_" });
  const http = new client.Histogram({ name: "gw_http_request_duration_seconds", help: "Gateway request time", labelNames: ["method", "route", "status"], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30], registers: [registry] });
  const cache = new client.Counter({ name: "gw_cache_total", help: "Cache lookups", labelNames: ["result"], registers: [registry] });
  const upstream = new client.Counter({ name: "gw_upstream_errors_total", help: "Errors talking to FastAPI", registers: [registry] });
  const win = []; // last 500 requests: {t, ms, status}
  const observe = (method, route, status, ms) => { http.labels(method, route, String(status)).observe(ms / 1000); win.push({ t: Date.now(), ms, status }); if (win.length > 500) win.shift(); };
  const summary = (sinceMs = 5 * 60_000) => {
    const rows = win.filter((r) => r.t >= Date.now() - sinceMs), n = rows.length, ms = rows.map((r) => r.ms).sort((a, b) => a - b);
    const q = (p) => (n ? ms[Math.min(n - 1, Math.floor(p * n))] : null);
    return { window_s: sinceMs / 1000, requests: n, error_rate: n ? rows.filter((r) => r.status >= 500).length / n : null, p50_ms: q(0.5), p95_ms: q(0.95), p99_ms: q(0.99) };
  };
  return { registry, observe, summary, cacheHit: () => cache.labels("hit").inc(), cacheMiss: () => cache.labels("miss").inc(), upstreamError: () => upstream.inc() };
}

export const requestMetrics = (metrics) => (req, res, next) => {
  if (req.originalUrl.startsWith("/__monitor/")) return next(); // the developer's own monitoring calls (and the secret in the path) stay out of the numbers
  const t0 = process.hrtime.bigint();
  res.on("finish", () => { const ms = Number(process.hrtime.bigint() - t0) / 1e6; metrics.observe(req.method, req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || "proxy", res.statusCode, ms); });
  next();
};
