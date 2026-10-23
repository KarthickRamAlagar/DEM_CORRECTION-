import { z } from "zod";
import path from "node:path";
import fs from "node:fs";

// reads gateway/.env without an extra package
function loadDotenv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const Schema = z.object({
  BIND_HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  UPSTREAM_URL: z.string().url().default("http://127.0.0.1:8000"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  MONITOR_SECRET: z.string().default(""),
  MONITOR_ALLOW_REMOTE: z.enum(["0", "1"]).default("0"),
  REDIS_URL: z.string().default(""),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(300),
  HEAVY_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(600),
  REPO_ROOT: z.string().default(".."),
});

export function loadConfig(env = process.env, { dotenvFile = path.resolve(process.cwd(), ".env") } = {}) {
  if (env === process.env) loadDotenv(dotenvFile);
  const c = Schema.parse(env);
  if (c.MONITOR_SECRET && c.MONITOR_SECRET.length < 16) throw new Error("MONITOR_SECRET is too short (use at least 16 characters, or leave it empty to switch monitoring off)");
  return { ...c, origins: c.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean), repoRoot: path.resolve(process.cwd(), c.REPO_ROOT), monitorOn: c.MONITOR_SECRET.length > 0 };
}
