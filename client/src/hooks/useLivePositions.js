import { useMemo } from "react";
import { getPosition, getGroundTrackSegments, bearingDeg, periodMinutes } from "../lib/orbitEngine";

// Ground tracks are expensive-ish to resample (many SGP4 calls), so we only
// recompute one when simulated time has moved more than this many minutes
// since we last computed it for that satellite — position updates every
// tick regardless, since a single propagate() call is cheap.
const TRACK_REFRESH_MINUTES = 3;

const trackCache = new Map(); // satId -> { atMs, segments }

export function useLivePositions(tleEntries, simTime) {
  return useMemo(() => {
    return tleEntries.map((sat) => {
      if (!sat.satrec) {
        return { ...sat, position: null, track: [], heading: null, periodMin: null };
      }

      const position = getPosition(sat.satrec, simTime);

      const cached = trackCache.get(sat.id);
      const staleMs = TRACK_REFRESH_MINUTES * 60 * 1000;
      let segments;
      if (cached && Math.abs(simTime.getTime() - cached.atMs) < staleMs) {
        segments = cached.segments;
      } else {
        segments = getGroundTrackSegments(sat.satrec, simTime, {
          spanOrbits: 1,
          samples: 90,
        });
        trackCache.set(sat.id, { atMs: simTime.getTime(), segments });
      }

      let heading = null;
      const lastSeg = segments[segments.length - 1];
      if (lastSeg && lastSeg.length >= 2) {
        heading = bearingDeg(lastSeg[lastSeg.length - 2], lastSeg[lastSeg.length - 1]);
      }

      return { ...sat, position, track: segments, heading, periodMin: periodMinutes(sat.satrec) };
    });
  }, [tleEntries, simTime]);
}
