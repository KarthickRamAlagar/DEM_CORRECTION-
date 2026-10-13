import * as satellite from "satellite.js";

const RAD2DEG = 180 / Math.PI;

/** Build a satrec from two TLE lines. Returns null if satellite.js can't parse it. */
export function buildSatrec(line1, line2) {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    // satrec.error is a nonzero SGP4 error code on malformed elements.
    if (!satrec || satrec.error) return null;
    return satrec;
  } catch {
    return null;
  }
}

function normalizeLon(lonDeg) {
  let l = lonDeg;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

/**
 * Propagate a satrec to `date` and return its geodetic position + speed, or
 * null if SGP4 couldn't propagate (e.g. decayed orbit, bad elements).
 */
export function getPosition(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;

  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);

  const { velocity } = pv;
  const speedKmS =
    velocity && typeof velocity !== "boolean"
      ? Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2)
      : null;

  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: normalizeLon(satellite.degreesLong(geo.longitude)),
    altKm: geo.height,
    speedKmS,
  };
}

/** Orbital period in minutes, derived from the satrec's mean motion (rad/min). */
export function periodMinutes(satrec) {
  return (2 * Math.PI) / satrec.no;
}

const EARTH_MU = 398600.4418; // km^3/s^2
const EARTH_RADIUS_KM = 6378.137;

/**
 * Real orbital elements read straight off the satrec (i.e. straight off the
 * TLE) — inclination, eccentricity, period, and apogee/perigee altitude
 * derived from the mean motion via the vis-viva relation. These are actual
 * numbers for the actual object, not placeholders.
 */
export function orbitalElements(satrec) {
  const inclinationDeg = (satrec.inclo * 180) / Math.PI;
  const eccentricity = satrec.ecco;
  const period = periodMinutes(satrec);

  const noRadPerSec = satrec.no / 60;
  const semiMajorAxisKm = Math.cbrt(EARTH_MU / noRadPerSec ** 2);
  const apogeeAltKm = semiMajorAxisKm * (1 + eccentricity) - EARTH_RADIUS_KM;
  const perigeeAltKm = semiMajorAxisKm * (1 - eccentricity) - EARTH_RADIUS_KM;

  return {
    inclinationDeg,
    eccentricity,
    periodMin: period,
    apogeeAltKm,
    perigeeAltKm,
  };
}

/**
 * Sample the ground track around `date` (default: half an orbit behind to
 * half an orbit ahead) and split it into segments wherever the path crosses
 * the antimeridian, so each segment can be drawn as a clean line without a
 * spurious wraparound stroke across the whole map.
 */
export function getGroundTrackSegments(satrec, date, { spanOrbits = 1, samples = 90 } = {}) {
  const periodMs = periodMinutes(satrec) * 60 * 1000;
  const spanMs = periodMs * spanOrbits;
  const startMs = date.getTime() - spanMs / 2;
  const stepMs = spanMs / samples;

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = new Date(startMs + i * stepMs);
    const pos = getPosition(satrec, t);
    if (pos) points.push([pos.lon, pos.lat]);
  }

  const segments = [];
  let current = [];
  for (let i = 0; i < points.length; i++) {
    if (current.length > 0) {
      const prevLon = current[current.length - 1][0];
      if (Math.abs(points[i][0] - prevLon) > 180) {
        segments.push(current);
        current = [];
      }
    }
    current.push(points[i]);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Compass bearing (degrees, 0 = north) from point a to point b — for rotating a marker icon. */
export function bearingDeg([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
}
