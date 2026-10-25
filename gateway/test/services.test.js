import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { loadConfig } from "../src/config.js";
import { createMetrics } from "../src/services/metricsService.js";
import { createServicesService } from "../src/services/servicesService.js";

const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const tcp = (reply) => net.createServer((s) => s.on("data", () => s.end(reply)));
const web = (routes) => http.createServer((req, res) => { const r = routes[req.url]; if (!r) { res.statusCode = 404; return res.end("no"); } res.setHeader("content-type", "application/json"); res.end(typeof r === "string" ? r : JSON.stringify(r)); });

test("services: working fakes report ok, a closed port reports not running, metrics carry dem_service_up", async () => {
  const pg = tcp(Buffer.from("S")), rd = tcp("+PONG\r\n");
  const nginx = web({ "/nginx-health": "ok" });
  const prom = web({ "/-/ready": "Prometheus is Ready.", "/api/v1/targets?state=active": { data: { activeTargets: [{ health: "up" }, { health: "up" }, { health: "down" }] } } });
  const graf = web({ "/api/health": { database: "ok", version: "11.0.0" } });
  const ports = await Promise.all([pg, rd, nginx, prom, graf].map(listen));
  const cfg = loadConfig({ PG_PORT: String(ports[0]), REDIS_URL: `redis://127.0.0.1:${ports[1]}`, NGINX_URL: `http://127.0.0.1:${ports[2]}`, PROMETHEUS_URL: `http://127.0.0.1:${ports[3]}`, GRAFANA_URL: `http://127.0.0.1:${ports[4]}`, MLFLOW_URL: "http://127.0.0.1:1" }, {});
  const metrics = createMetrics(), svc = createServicesService({ cfg, metrics });
  const r = Object.fromEntries((await svc.snapshot()).map((x) => [x.id, x]));
  assert.equal(r.postgres.ok, true); assert.equal(r.redis.ok, true); assert.equal(r.nginx.ok, true);
  assert.equal(r.prometheus.ok, true); assert.equal(r.prometheus.targets_up, 2); assert.equal(r.prometheus.targets, 3);
  assert.equal(r.grafana.ok, true); assert.match(r.grafana.detail, /11\.0\.0/);
  assert.equal(r.mlflow.ok, false); assert.match(r.mlflow.detail, /not running|not reachable/);
  const text = await metrics.registry.metrics();
  assert.match(text, /dem_service_up\{service="postgres"\} 1/); assert.match(text, /dem_service_up\{service="mlflow"\} 0/);
  [pg, rd, nginx, prom, graf].forEach((s) => s.close());
});

test("services: a wrong answer is not ok; redis asking for a password still counts as answering", async () => {
  const pg = tcp(Buffer.from("X")), rd = tcp("-NOAUTH Authentication required.\r\n");
  const ports = await Promise.all([pg, rd].map(listen));
  const cfg = loadConfig({ PG_PORT: String(ports[0]), REDIS_URL: `redis://127.0.0.1:${ports[1]}`, NGINX_URL: "http://127.0.0.1:1", PROMETHEUS_URL: "http://127.0.0.1:1", GRAFANA_URL: "http://127.0.0.1:1", MLFLOW_URL: "http://127.0.0.1:1" }, {});
  const r = Object.fromEntries((await createServicesService({ cfg, metrics: createMetrics() }).snapshot()).map((x) => [x.id, x]));
  assert.equal(r.postgres.ok, false); assert.equal(r.redis.ok, true); assert.match(r.redis.detail, /password/);
  assert.ok(r.firewall.ok === null || typeof r.firewall.ok === "boolean"); // true on a machine that has the DEM-SDG rule, false or null elsewhere
  pg.close(); rd.close();
});

test("services: SERVICES_PROBE=0 switches the checks off", async () => {
  const cfg = loadConfig({ SERVICES_PROBE: "0" }, {});
  assert.deepEqual(await createServicesService({ cfg, metrics: createMetrics() }).snapshot(), []);
});
