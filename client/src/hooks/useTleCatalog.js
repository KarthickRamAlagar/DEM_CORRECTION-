import { API_BASE } from "../lib/apiBase";
import { useEffect, useState } from "react";
import { satelliteCatalog } from "../data/satelliteCatalog";
import { fallbackTle } from "../lib/fallbackTle";
import { buildSatrec } from "../lib/orbitEngine";

// FIX: was calling CelesTrak DIRECTLY from the browser, which gets
// net::ERR_CONNECTION_RESET once CelesTrak's IP-based rate limit kicks
// in (confirmed happening for every satellite). Now routes through our
// own backend proxy (server/main.py), which is the only thing that
// talks to CelesTrak directly, on a controlled schedule, with shared
// caching across all users/tabs.
const TLE_PROXY_URL = (name) =>
  `${API_BASE}/tle/${encodeURIComponent(name)}`;

// CelesTrak only updates GP data every 2 hours and explicitly enforces this
// with HTTP 403s — repeated requests within that window can get an IP
// address sent to their firewall, causing every request to start failing at
// once, not just one satellite's. Docs: https://celestrak.org/NORAD/documentation/gp-data-formats.php
//
// Three separate protections here, because there are three separate ways
// this hook can end up hitting the network more than intended:
//   1. FRESH_MS / STALE_USABLE_MS (localStorage) — don't ask for data more
//      often than CelesTrak actually updates it, across page reloads.
//   2. FAIL_COOLDOWN_MS (localStorage) — if a satellite's last attempt
//      failed recently, don't immediately retry on the next reload either
//      (a blocked IP stays blocked; retrying doesn't help and just adds to
//      the request count that's keeping it blocked).
//   3. inFlightRequests (module-scope Map) — React 18 StrictMode
//      intentionally double-invokes effects in dev, which without this
//      turns every one of the above into two near-simultaneous requests
//      instead of one, for no benefit.
const CACHE_PREFIX = "leo-dashboard:tle:v1:";
const FRESH_MS = 2 * 60 * 60 * 1000; // 2h — matches CelesTrak's own update cadence
const STALE_USABLE_MS = 7 * 24 * 60 * 60 * 1000; // 7d — beyond this, propagation accuracy degrades too far to be worth showing
const FAIL_COOLDOWN_MS = 10 * 60 * 1000; // 10min — don't hammer an endpoint that just failed/blocked us

const inFlightRequests = new Map(); // satId -> Promise, shared across StrictMode's duplicate effect invocations

function readCache(satId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + satId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.line1 || !parsed?.line2 || !parsed?.fetchedAt) return null;
    return parsed;
  } catch {
    return null; // corrupt entry, private browsing, storage disabled, etc.
  }
}

function writeCache(satId, line1, line2) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + satId,
      JSON.stringify({ line1, line2, fetchedAt: Date.now() })
    );
  } catch {
    // Storage full/disabled — non-fatal, we just lose caching for this run.
  }
}

function readLastFailure(satId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + "fail:" + satId);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeLastFailure(satId) {
  try {
    localStorage.setItem(CACHE_PREFIX + "fail:" + satId, String(Date.now()));
  } catch {
    // non-fatal
  }
}

async function fetchTle(sat) {
  // FIX: our proxy already returns clean {line1, line2, source} JSON -
  // the raw-text parsing that was needed for CelesTrak's format is now
  // handled server-side, once, instead of in every browser.
  const res = await fetch(TLE_PROXY_URL(sat.name));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.line1 || !data.line2) throw new Error("Unexpected TLE response");
  return { line1: data.line1, line2: data.line2 };
}

function withResultFallback(sat, cached, age) {
  if (cached && age < STALE_USABLE_MS) {
    const satrec = buildSatrec(cached.line1, cached.line2);
    if (satrec) return { satrec, status: "fallback" };
  }
  const fb = fallbackTle[sat.id];
  if (fb) {
    const satrec = buildSatrec(fb.line1, fb.line2);
    if (satrec) return { satrec, status: "fallback" };
  }
  return { satrec: null, status: "unavailable" };
}

/**
 * Fetches a TLE per catalog entry — from a fresh local cache, then the
 * network (unless a recent attempt already failed — see FAIL_COOLDOWN_MS),
 * then a stale-but-recent local cache, then the bundled snapshot
 * (src/lib/fallbackTle.js) — and returns a satrec (SGP4 record) ready for
 * propagation. `status` per satellite is one of
 * "loading" | "live" | "fallback" | "unavailable". "live" covers both a
 * fresh network fetch and a still-fresh cache hit; "fallback" covers a
 * stale cache or the bundled snapshot.
 */
export function useTleCatalog() {
  const [entries, setEntries] = useState(() =>
    satelliteCatalog.map((sat) => ({ ...sat, satrec: null, status: "loading" }))
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOne(sat) {
      const cached = readCache(sat.id);
      const age = cached ? Date.now() - cached.fetchedAt : Infinity;

      if (cached && age < FRESH_MS) {
        const satrec = buildSatrec(cached.line1, cached.line2);
        if (satrec) return { satrec, status: "live" };
      }

      const lastFailure = readLastFailure(sat.id);
      const skipNetwork = lastFailure != null && Date.now() - lastFailure < FAIL_COOLDOWN_MS;
      if (skipNetwork) {
        return withResultFallback(sat, cached, age);
      }

      try {
        // Dedupe concurrent/duplicate calls (StrictMode double-invoke) so
        // they share one network request instead of firing two.
        let promise = inFlightRequests.get(sat.id);
        if (!promise) {
          promise = fetchTle(sat);
          inFlightRequests.set(sat.id, promise);
          promise.finally(() => inFlightRequests.delete(sat.id));
        }
        const { line1, line2 } = await promise;

        const satrec = buildSatrec(line1, line2);
        if (!satrec) throw new Error("SGP4 parse failed");
        writeCache(sat.id, line1, line2);
        return { satrec, status: "live" };
      } catch {
        writeLastFailure(sat.id);
        return withResultFallback(sat, cached, age);
      }
    }

    (async () => {
      const results = await Promise.all(satelliteCatalog.map(loadOne));
      if (cancelled) return;
      setEntries(
        satelliteCatalog.map((sat, i) => ({
          ...sat,
          satrec: results[i].satrec,
          status: results[i].status,
        }))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return entries;
}
