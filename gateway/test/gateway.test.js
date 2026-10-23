import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/app.js";

let up, upUrl, gw, base, calls = 0, cache;
const SECRET = "s".repeat(24);
before(async () => {
  up = http.createServer((req, res) => {
    calls += 1; let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ url: req.url, method: req.method, body })); });
  });
  await new Promise((r) => up.listen(0, "127.0.0.1", r)); upUrl = `http://127.0.0.1:${up.address().port}`;
  const cfg = loadConfig({ UPSTREAM_URL: upUrl, MONITOR_SECRET: SECRET, RATE_LIMIT_PER_MIN: "500" }, {});
  const r = await createApp(cfg); cache = r.cache;
  gw = http.createServer(r.app); await new Promise((x) => gw.listen(0, "127.0.0.1", x)); base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { gw.close(); up.close(); });

test("healthz is public and tiny", async () => { const r = await fetch(`${base}/healthz`); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true }); assert.ok(r.headers.get("x-request-id")); });
test("security headers are set, no x-powered-by", async () => { const r = await fetch(`${base}/healthz`); assert.ok(r.headers.get("x-content-type-options")); assert.equal(r.headers.get("x-powered-by"), null); });
test("CORS: allowed origin echoed, other origin not", async () => {
  const a = await fetch(`${base}/healthz`, { headers: { origin: "http://localhost:5173" } }); assert.equal(a.headers.get("access-control-allow-origin"), "http://localhost:5173");
  const b = await fetch(`${base}/healthz`, { headers: { origin: "http://evil.example" } }); assert.equal(b.headers.get("access-control-allow-origin"), null);
});
test("validation: bad latitude and unknown parameter are 400", async () => {
  assert.equal((await fetch(`${base}/api/sdg/chain/scene?lat=999&lon=83`)).status, 400);
  assert.equal((await fetch(`${base}/api/sdg/chain/scene?lat=26&lon=83&radius_km=9`)).status, 400);
  assert.equal((await fetch(`${base}/api/sdg/chain/point?lat=26&lon=83&raw_z=40&corrected_z=38&hack=1`)).status, 400);
  assert.equal((await fetch(`${base}/api/sdg/chain/region?country=XX`)).status, 400);
});
test("cache: second equal request is a HIT and does not reach FastAPI", async () => {
  const q = "lat=26.5&lon=83&radius_km=10&rise_m=2"; const before = calls;
  const a = await fetch(`${base}/api/sdg/chain/scenario?${q}`); assert.equal(a.headers.get("x-cache"), "MISS"); await a.text();
  const b = await fetch(`${base}/api/sdg/chain/scenario?rise_m=2&radius_km=10&lon=83&lat=26.5`); assert.equal(b.headers.get("x-cache"), "HIT");
  assert.equal(calls - before, 1);
  assert.equal(cache.kind(), "memory");
});
test("other /api routes pass straight through, including POST bodies", async () => {
  const r = await fetch(`${base}/api/predict/x?a=1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k: 1 }) });
  const j = await r.json(); assert.equal(j.url, "/api/predict/x?a=1"); assert.equal(j.method, "POST"); assert.equal(j.body, '{"k":1}');
});
test("DELETE under /api is refused", async () => assert.equal((await fetch(`${base}/api/anything`, { method: "DELETE" })).status, 405));
test("oversized body is refused", async () => { const r = await fetch(`${base}/api/x`, { method: "POST", headers: { "content-length": String(6 * 1024 * 1024) }, body: "a" }).catch(() => null); assert.ok(!r || r.status === 413 || r.status >= 400); });
test("monitoring: wrong or missing secret looks like any 404", async () => {
  const a = await fetch(`${base}/__monitor/wrong/health`); const b = await fetch(`${base}/nothing-here`);
  assert.equal(a.status, 404); assert.equal(b.status, 404); assert.deepEqual(await a.json(), await b.json());
});
test("monitoring: right secret from this computer works", async () => {
  const h = await (await fetch(`${base}/__monitor/${SECRET}/health`)).json();
  assert.ok(h.host.mem_total_gb > 0); assert.equal(h.upstream.ok, true); assert.ok("p95_ms" in h.api);
  const p = await (await fetch(`${base}/__monitor/${SECRET}/pipeline`)).json(); assert.ok("last_etl" in p);
  const m = await (await fetch(`${base}/__monitor/${SECRET}/metrics`)).text(); assert.match(m, /gw_http_request_duration_seconds/); assert.match(m, /gw_cache_total/);
  const q = await (await fetch(`${base}/__monitor/${SECRET}/quality`)).json(); assert.equal(q.status, "No data");
});
test("monitoring: a request that came from another machine is refused", async () => {
  const r = await fetch(`${base}/__monitor/${SECRET}/health`, { headers: { "x-forwarded-for": "203.0.113.9" } }); assert.equal(r.status, 404);
});
test("heavy routes are rate limited", async () => {
  const cfg = loadConfig({ UPSTREAM_URL: upUrl, HEAVY_RATE_LIMIT_PER_MIN: "3" }, {}); const { app } = await createApp(cfg); const s = http.createServer(app); await new Promise((x) => s.listen(0, "127.0.0.1", x));
  const codes = []; for (let i = 0; i < 6; i++) codes.push((await fetch(`http://127.0.0.1:${s.address().port}/api/sdg/chain/region?rise_m=${i}`)).status);
  s.close(); assert.ok(codes.includes(429), codes.join(","));
});
test("monitoring switched off when no secret is set", async () => {
  const cfg = loadConfig({ UPSTREAM_URL: upUrl }, {}); const { app } = await createApp(cfg); const s = http.createServer(app); await new Promise((x) => s.listen(0, "127.0.0.1", x));
  const r = await fetch(`http://127.0.0.1:${s.address().port}/__monitor/${SECRET}/health`); assert.equal(r.status, 404); s.close();
});
test("monitoring calls are not counted in the latency window", async () => {
  const a = await (await fetch(`${base}/__monitor/${SECRET}/health`)).json();
  await fetch(`${base}/__monitor/${SECRET}/pipeline`); await fetch(`${base}/__monitor/${SECRET}/pipeline`);
  const b = await (await fetch(`${base}/__monitor/${SECRET}/health`)).json();
  assert.equal(b.api.requests, a.api.requests);
});
test("the secret never appears in the Prometheus labels", async () => {
  const txt = await (await fetch(`${base}/__monitor/${SECRET}/metrics`)).text();
  assert.ok(!txt.includes(SECRET));
});
test("config rejects a short secret", () => assert.throws(() => loadConfig({ MONITOR_SECRET: "short" }, {})));
