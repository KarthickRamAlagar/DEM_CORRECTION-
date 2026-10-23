import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";

const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();

// CPU use measured between two reads of os.cpus()
let prev = os.cpus().map((c) => ({ ...c.times }));
function cpuPercent() {
  const now = os.cpus().map((c) => ({ ...c.times })); let busy = 0, total = 0;
  now.forEach((t, i) => { const p = prev[i], idle = t.idle - p.idle, all = Object.keys(t).reduce((a, k) => a + (t[k] - p[k]), 0); total += all; busy += all - idle; });
  prev = now; return total ? (100 * busy) / total : null;
}

const IGNORE = new Set(["quality", "lineage", ".git", "node_modules", "__pycache__"]); // reports written by the checks are not ETL runs

// newest modification time under a folder (3 levels, at most 4000 entries), or null
export function newestMtime(dir, depth = 3) {
  let best = null, seen = 0;
  const walk = (d, lvl) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++seen > 4000) return;
      const p = path.join(d, e.name);
      try { if (e.isDirectory()) { if (lvl < depth && !IGNORE.has(e.name)) walk(p, lvl + 1); } else { const m = fs.statSync(p).mtimeMs; if (best === null || m > best) best = m; } } catch { /* skip */ }
    }
  };
  walk(dir, 1);
  return best === null ? null : new Date(best).toISOString();
}

export function createHealthService({ cfg, upstream, metrics, cache }) {
  const disk = () => { try { const s = fs.statfsSync(cfg.repoRoot); return { path: cfg.repoRoot, total_gb: +(s.blocks * s.bsize / 1e9).toFixed(1), free_gb: +(s.bavail * s.bsize / 1e9).toFixed(1) }; } catch { return null; } };
  return {
    async snapshot() {
      const mem = process.memoryUsage(), up = await upstream.ping();
      cpuPercent(); await new Promise((r) => setTimeout(r, 250));
      return {
        time: new Date().toISOString(),
        host: { platform: os.platform(), cpus: os.cpus().length, cpu_percent: cpuPercent(), mem_total_gb: +(os.totalmem() / 1e9).toFixed(1), mem_free_gb: +(os.freemem() / 1e9).toFixed(1), disk: disk() },
        gateway: { uptime_s: Math.round(process.uptime()), rss_mb: Math.round(mem.rss / 1e6), heap_mb: Math.round(mem.heapUsed / 1e6), event_loop_p99_ms: +(loop.percentile(99) / 1e6).toFixed(1), cache: cache.kind() },
        api: metrics.summary(),
        upstream: up,
      };
    },
    pipeline() {
      const r = cfg.repoRoot;
      return {
        last_etl: newestMtime(path.join(r, "data", "processed", "sdg")),
        last_feature_build: newestMtime(path.join(r, "data", "final")),
        last_model_file: newestMtime(path.join(r, "model", "saved")),
        note: "Times are the newest file change in each folder. A missing time means the folder is empty or absent.",
      };
    },
    readJson(...parts) { const f = path.join(cfg.repoRoot, ...parts); try { return { found: true, data: JSON.parse(fs.readFileSync(f, "utf8")) }; } catch { return { found: false, file: parts.join("/") }; } },
  };
}
