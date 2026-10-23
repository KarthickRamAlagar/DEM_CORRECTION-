// Cache for repeated map and scenario answers. Redis when REDIS_URL is set and reachable, otherwise a small in-memory LRU.
// Entries bigger than MAX_ENTRY are not stored.
const MAX_ENTRY = 12 * 1024 * 1024, MAX_ITEMS = 120;

export async function createCache({ redisUrl = "", ttlSeconds = 600, metrics = null } = {}) {
  let redis = null;
  if (redisUrl) {
    try {
      const { default: Redis } = await import("ioredis");
      redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
      redis.on("error", () => {});
      await redis.connect();
    } catch { redis = null; }
  }
  const mem = new Map();
  const memGet = (k) => { const e = mem.get(k); if (!e) return null; if (e.exp < Date.now()) { mem.delete(k); return null; } mem.delete(k); mem.set(k, e); return e.body; };
  const memSet = (k, body) => { mem.set(k, { body, exp: Date.now() + ttlSeconds * 1000 }); while (mem.size > MAX_ITEMS) mem.delete(mem.keys().next().value); };
  return {
    kind: () => (redis ? "redis" : "memory"),
    async get(k) {
      let v = null;
      if (redis) { try { v = await redis.get(`gw:${k}`); } catch { v = null; } } else v = memGet(k);
      (v ? metrics?.cacheHit : metrics?.cacheMiss)?.();
      return v;
    },
    async set(k, body) {
      if (!ttlSeconds || typeof body !== "string" || body.length > MAX_ENTRY) return;
      if (redis) { try { await redis.set(`gw:${k}`, body, "EX", ttlSeconds); } catch { /* cache is optional */ } } else memSet(k, body);
    },
    async close() { try { await redis?.quit(); } catch { /* ignore */ } },
  };
}
