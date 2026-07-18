/**
 * Day/night terminator geometry. Pure functions only — no I/O.
 *
 * The subsolar point (the point on Earth directly under the sun) is
 * computed with the standard low-precision solar position approximation
 * (mean longitude + equation-of-center + obliquity of the ecliptic; see
 * e.g. Meeus, "Astronomical Algorithms", ch. 25 low-accuracy formulas).
 * This is accurate to roughly ±0.01° in declination and a few tenths of a
 * degree in the equation of time, well within the ±1° the dashboard needs
 * for a wall-map-scale terminator overlay. It intentionally does not
 * account for nutation, aberration or atmospheric refraction.
 */
import type { GeoPoint } from "./types";
import { d2r, r2d, wrapLon } from "./geo";

export interface SubsolarPoint {
  lat: number;
  lon: number;
}

const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/** Subsolar point (sub-solar latitude = solar declination) for a given instant. */
export function subsolarPoint(date: Date): SubsolarPoint {
  const daysSinceJ2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86_400_000;

  const meanLongitudeDeg = normalizeDeg(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomalyDeg = normalizeDeg(357.528 + 0.9856003 * daysSinceJ2000);
  const eclipticLongitudeDeg = normalizeDeg(
    meanLongitudeDeg +
      1.915 * Math.sin(d2r(meanAnomalyDeg)) +
      0.02 * Math.sin(d2r(2 * meanAnomalyDeg))
  );
  const obliquityDeg = 23.439 - 0.0000004 * daysSinceJ2000;

  const declinationRad = Math.asin(
    Math.sin(d2r(obliquityDeg)) * Math.sin(d2r(eclipticLongitudeDeg))
  );
  const rightAscensionRad = Math.atan2(
    Math.cos(d2r(obliquityDeg)) * Math.sin(d2r(eclipticLongitudeDeg)),
    Math.cos(d2r(eclipticLongitudeDeg))
  );
  const rightAscensionDeg = normalizeDeg(r2d(rightAscensionRad));

  // Equation of time, expressed as a longitude offset (degrees), wrapped to
  // (-180, 180] so it stays a small correction rather than a full revolution.
  let lonDiffDeg = meanLongitudeDeg - rightAscensionDeg;
  lonDiffDeg = ((((lonDiffDeg + 180) % 360) + 360) % 360) - 180;

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const subsolarLon = wrapLon(-15 * (utcHours - 12) - lonDiffDeg);

  return { lat: r2d(declinationRad), lon: subsolarLon };
}

/**
 * Terminator great-circle sampled as a polyline across all longitudes
 * (points where solar elevation = 0). `stepDeg` controls sampling density.
 */
export function terminatorLine(date: Date, stepDeg = 2): GeoPoint[] {
  const sub = subsolarPoint(date);
  const decRad = d2r(sub.lat);
  // Guard against the near-equinox singularity (tan(dec) -> 0) so the curve
  // stays finite; the true terminator there is a pair of meridians, but a
  // very small nonzero declination keeps this a numerically stable
  // approximation of it without a special-cased branch.
  const tanDec = Math.tan(decRad === 0 ? 1e-6 : decRad);

  const points: GeoPoint[] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const dLonRad = d2r(lon - sub.lon);
    const lat = r2d(Math.atan(-Math.cos(dLonRad) / tanDec));
    points.push({ lat, lon });
  }
  return points;
}

/**
 * Closed polygon covering the night hemisphere on an equirectangular
 * (lon in [-180,180], lat in [-90,90]) projection: the terminator line plus
 * a cap that wraps around whichever pole lies in permanent night for this
 * declination, closing the shape at the map's left/right edges.
 */
export function nightPolygon(date: Date, stepDeg = 2): GeoPoint[] {
  const sub = subsolarPoint(date);
  const line = terminatorLine(date, stepDeg);
  // sin(dec) > 0 (northern-hemisphere summer) => south pole is in night.
  const nightPoleLat = Math.sin(d2r(sub.lat)) >= 0 ? -90 : 90;

  return [
    { lat: nightPoleLat, lon: -180 },
    ...line,
    { lat: nightPoleLat, lon: 180 },
  ];
}
