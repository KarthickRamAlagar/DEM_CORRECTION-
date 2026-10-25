import net from "node:net";
import { execFile } from "node:child_process";
import client from "prom-client";

// Patch 8c: asks each extra service one tiny question and reports what it answered. Read-only, loopback addresses from gateway/.env.
// Postgres: the 8-byte SSL request (the server answers S or N). Redis: PING. NGINX, Prometheus, Grafana, MLflow: their own health URLs.
// Windows firewall: reads one rule by name. Nothing is changed, nothing is stored, no password is sent.
const TIMEOUT = 1200;
const PG_SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);
const FW_RULE = "DEM-SDG 8c block inbound";

const done = (t0, ok, detail, extra = {}) => ({ ok, ms: Math.round(performance.now() - t0), detail, ...extra });

function tcpAsk(host, port, payload, accept) {
  return new Promise((resolve) => {
    const t0 = performance.now(); let finished = false; const s = new net.Socket();
    const end = (ok, detail) => { if (finished) return; finished = true; s.destroy(); resolve(done(t0, ok, detail)); };
    s.setTimeout(TIMEOUT, () => end(false, "no answer"));
    s.once("error", (e) => end(false, e.code === "ECONNREFUSED" ? "not running (port closed)" : e.code || "error"));
    s.once("data", (d) => { const r = accept(d); end(r.ok, r.detail); });
    s.connect(port, host, () => s.write(payload));
  });
}

async function httpAsk(url, check) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: "manual" });
    const text = await r.text().catch(() => "");
    const c = check ? check(r, text) : { ok: r.status === 200, detail: `HTTP ${r.status}` };
    return done(t0, c.ok, c.detail, c.extra || {});
  } catch (e) {
    return done(t0, false, e?.cause?.code === "ECONNREFUSED" ? "not running (port closed)" : e?.name === "TimeoutError" ? "no answer" : "not reachable");
  }
}

function hostPort(url, defHost, defPort) {
  try { const u = new URL(url); return { host: u.hostname || defHost, port: Number(u.port) || defPort }; } catch { return { host: defHost, port: defPort }; }
}

function firewall() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    if (process.platform !== "win32") return resolve(done(t0, null, "checked on Windows only"));
    execFile("netsh", ["advfirewall", "firewall", "show", "rule", `name=${FW_RULE}`], { timeout: 4000, windowsHide: true }, (err, out) => {
      const text = String(out || "");
      if (/Enabled:\s+Yes/i.test(text) && /Action:\s+Block/i.test(text)) return resolve(done(t0, true, "block rule is on", { ports: (/LocalPort:\s+(.+)/i.exec(text)?.[1] || "").trim() }));
      if (/No rules match/i.test(text) || err) return resolve(done(t0, false, "rule not installed (run ops/windows/firewall_8c.ps1 as administrator)"));
      resolve(done(t0, false, "rule found but not enabled"));
    });
  });
}

export function createServicesService({ cfg, metrics }) {
  const up = new client.Gauge({ name: "dem_service_up", help: "1 when an extra service answered its health question", labelNames: ["service"], registers: [metrics.registry] });
  const pg = { host: cfg.PG_HOST, port: cfg.PG_PORT };
  const rd = hostPort(cfg.REDIS_URL || "redis://127.0.0.1:6379", "127.0.0.1", 6379);
  const probes = [
    ["postgres", "PostgreSQL / PostGIS", () => tcpAsk(pg.host, pg.port, PG_SSL_REQUEST, (d) => ({ ok: d[0] === 0x53 || d[0] === 0x4e, detail: "answering the PostgreSQL protocol" }))],
    ["redis", "Redis", () => tcpAsk(rd.host, rd.port, Buffer.from("PING\r\n"), (d) => { const t = d.toString(); return t.startsWith("+PONG") ? { ok: true, detail: "answered PING" } : t.startsWith("-NOAUTH") ? { ok: true, detail: "answering (password needed)" } : { ok: false, detail: "unexpected answer" }; })],
    ["nginx", "NGINX (front door)", () => httpAsk(`${cfg.NGINX_URL}/nginx-health`, (r, t) => ({ ok: r.status === 200 && /ok/i.test(t), detail: `HTTP ${r.status}` }))],
    ["prometheus", "Prometheus", async () => {
      const r = await httpAsk(`${cfg.PROMETHEUS_URL}/-/ready`);
      if (!r.ok) return r;
      const t = await httpAsk(`${cfg.PROMETHEUS_URL}/api/v1/targets?state=active`, (resp, text) => { try { const a = JSON.parse(text).data.activeTargets; const upN = a.filter((x) => x.health === "up").length; return { ok: true, detail: `${upN} of ${a.length} targets up`, extra: { targets_up: upN, targets: a.length } }; } catch { return { ok: true, detail: "ready" }; } });
      return { ...r, detail: t.detail, targets_up: t.targets_up ?? null, targets: t.targets ?? null };
    }],
    ["grafana", "Grafana", () => httpAsk(`${cfg.GRAFANA_URL}/api/health`, (r, t) => { try { const j = JSON.parse(t); return { ok: r.status === 200 && j.database === "ok", detail: `database ${j.database}, version ${j.version}` }; } catch { return { ok: false, detail: `HTTP ${r.status}` }; } })],
    ["mlflow", "MLflow (experiment history)", () => httpAsk(`${cfg.MLFLOW_URL}/health`)],
    ["firewall", "Windows firewall block rule", firewall],
  ];
  let last = 0, cached = null;
  return {
    async snapshot() {
      if (!cfg.SERVICES_PROBE) return [];
      if (cached && Date.now() - last < 4000) return cached;
      const res = await Promise.all(probes.map(async ([id, name, fn]) => { let r; try { r = await fn(); } catch { r = { ok: false, ms: null, detail: "probe failed" }; } if (r.ok !== null) up.labels(id).set(r.ok ? 1 : 0); return { id, name, ...r }; }));
      cached = res; last = Date.now(); return res;
    },
  };
}
