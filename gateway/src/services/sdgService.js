// Cached read of the SDG routes. Only successful (200) answers are cached; the key is the cleaned query, so equal requests share one answer.
export function createSdgService({ upstream, cache }) {
  return {
    async fetch(path, query) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])); qs.sort();
      const url = `/api/sdg${path}${qs.size ? `?${qs}` : ""}`, hit = await cache.get(url);
      if (hit) return { status: 200, body: hit, type: "application/json", cached: true };
      const r = await upstream.getJson(url);
      if (r.status === 200) await cache.set(url, r.body);
      return { ...r, cached: false };
    },
  };
}
