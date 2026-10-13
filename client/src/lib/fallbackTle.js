// Offline fallback TLE snapshot — used ONLY when the live fetch to CelesTrak
// fails (no network, CORS blocked, rate limited, etc). This is a fixed
// snapshot from a past epoch, not live data: satellite.js will still
// propagate a physically correct orbit from it, but the satellite's real
// current position will have drifted from what this produces. Treat any
// satellite running on a fallback TLE as "demo mode" — refresh this (or
// better, add a small backend proxy that re-fetches CelesTrak periodically
// and caches it) before relying on it for anything real.
//
// We only keep a verified-good snapshot for ISS here. For every other
// satellite in the catalog we'd rather show "live data unavailable" than
// risk shipping a malformed or made-up TLE, since a bad fixed-width TLE
// can produce a nonsense orbit or fail to parse.
export const fallbackTle = {
  ISS: {
    line1:
      "1 25544U 98067A   19343.69339541  .00001764  00000-0  38792-4 0  9991",
    line2:
      "2 25544  51.6439 211.2001 0007417  17.6667  85.6398 15.50103472202482",
  },
};
