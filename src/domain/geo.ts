/** Small spherical-earth helpers (used by the SIMULATED mode and the map). */

export const R_EARTH_KM = 6371;

export const wrapLon = (lon: number): number => ((lon + 540) % 360) - 180;
export const d2r = (d: number): number => (d * Math.PI) / 180;
export const r2d = (r: number): number => (r * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export function greatCircleKm(a: LatLon, b: LatLon): number {
  const dLat = d2r(b.lat - a.lat);
  const dLon = d2r(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(d2r(a.lat)) * Math.cos(d2r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(from: LatLon, to: LatLon): number {
  const y = Math.sin(d2r(to.lon - from.lon)) * Math.cos(d2r(to.lat));
  const x =
    Math.cos(d2r(from.lat)) * Math.sin(d2r(to.lat)) -
    Math.sin(d2r(from.lat)) * Math.cos(d2r(to.lat)) * Math.cos(d2r(to.lon - from.lon));
  return (r2d(Math.atan2(y, x)) + 360) % 360;
}

export function destPoint(p: LatLon, brgDeg: number, dKm: number): LatLon {
  const dl = dKm / R_EARTH_KM;
  const th = d2r(brgDeg);
  const p1 = d2r(p.lat);
  const l1 = d2r(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(th));
  const l2 =
    l1 +
    Math.atan2(Math.sin(th) * Math.sin(dl) * Math.cos(p1), Math.cos(dl) - Math.sin(p1) * Math.sin(p2));
  return { lat: r2d(p2), lon: wrapLon(r2d(l2)) };
}
