// The only place that talks to FastAPI.
export function createUpstream(baseUrl, { timeoutMs = 120_000, onError = () => {} } = {}) {
  return {
    async getJson(pathAndQuery) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch(`${baseUrl}${pathAndQuery}`, { signal: ctl.signal, headers: { accept: "application/json" } });
        return { status: r.status, body: await r.text(), type: r.headers.get("content-type") || "application/json" };
      } catch (e) { onError(e); return { status: 502, body: JSON.stringify({ error: "The analysis service did not answer." }), type: "application/json" }; }
      finally { clearTimeout(t); }
    },
    async ping() {
      const t0 = Date.now();
      try { const r = await fetch(`${baseUrl}/api/sdg/meta`, { signal: AbortSignal.timeout(4000) }); return { ok: r.status < 500, status: r.status, ms: Date.now() - t0 }; }
      catch { return { ok: false, status: null, ms: Date.now() - t0 }; }
    },
  };
}
