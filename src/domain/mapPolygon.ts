/**
 * Pure geometry helpers for rendering geographic polygons (land masses,
 * satellite footprint circles) on the equirectangular WorldMap without
 * antimeridian-crossing artifacts. No I/O, no React.
 */
import { type LatLon, d2r, destPoint, footprintHalfAngleDeg, R_EARTH_KM } from "./geo";

/**
 * Unwrap a ring's longitudes so adjacent points never differ by more than
 * 180 degrees, dropping an explicit closing point that duplicates the first.
 * Output longitudes are unbounded (may extend past +/-180).
 */
export function unwrapRing(ring: LatLon[]): LatLon[] {
  if (ring.length === 0) return [];
  let pts = ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first.lat === last.lat && first.lon === last.lon) {
    pts = ring.slice(0, -1);
  }
  const out: LatLon[] = [{ lat: pts[0].lat, lon: pts[0].lon }];
  let prevLon = pts[0].lon;
  for (let i = 1; i < pts.length; i++) {
    let lon = pts[i].lon;
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push({ lat: pts[i].lat, lon });
    prevLon = lon;
  }
  return out;
}

/**
 * Close a ring that winds around a pole by appending two cap points at the
 * pole latitude. Rings that don't encircle a pole are returned unchanged.
 */
export function closeRing(unwrapped: LatLon[], poleLatHint?: number): LatLon[] {
  if (unwrapped.length === 0) return unwrapped;
  const first = unwrapped[0];
  const last = unwrapped[unwrapped.length - 1];
  const winding = last.lon - first.lon;
  if (Math.abs(winding) < 180) return unwrapped;

  let pole: number;
  if (poleLatHint !== undefined) {
    pole = poleLatHint;
  } else {
    const meanLat = unwrapped.reduce((s, p) => s + p.lat, 0) / unwrapped.length;
    pole = meanLat === 0 ? 90 : 90 * Math.sign(meanLat);
  }

  // Both cap points sit exactly on the pole (the map's top/bottom border in
  // an equirectangular projection). cap1 continues from the last ring point
  // at the same longitude (delta 0); cap2 uses the raw, unshifted first.lon
  // so the implicit SVG closing edge (cap2 -> ring's first point) is a
  // short vertical segment. The cap1->cap2 edge itself can span up to ~360
  // degrees, but because both endpoints lie exactly on the map border
  // (lat === +/-90), that edge is harmless there — filling right up to the
  // border is the correct behavior for a ring that encircles the pole.
  return [...unwrapped, { lat: pole, lon: last.lon }, { lat: pole, lon: first.lon }];
}

/** Convert Natural Earth land rings ([lon, lat] pairs) into closed, unwrapped LatLon polygons. */
export function landPolygons(rings: number[][][]): LatLon[][] {
  return rings.map((ring) => {
    const latlon = ring.map(([lon, lat]) => ({ lat, lon }));
    return closeRing(unwrapRing(latlon));
  });
}

/** Polygon approximating the satellite's visibility footprint circle, safe for antimeridian/pole crossing. */
export function footprintPolygon(center: LatLon, altKm: number, steps = 72): LatLon[] {
  const r = footprintHalfAngleDeg(altKm);

  if (Math.abs(center.lat) >= 89.9) {
    if (center.lat >= 0) {
      return [
        { lat: 90, lon: -180 },
        { lat: 90, lon: 180 },
        { lat: 90 - r, lon: 180 },
        { lat: 90 - r, lon: -180 },
      ];
    }
    return [
      { lat: -90, lon: -180 },
      { lat: -90, lon: 180 },
      { lat: -90 + r, lon: 180 },
      { lat: -90 + r, lon: -180 },
    ];
  }

  const radiusKm = d2r(r) * R_EARTH_KM;
  const pts: LatLon[] = [];
  for (let i = 0; i < steps; i++) {
    pts.push(destPoint(center, (360 / steps) * i, radiusKm));
  }
  const unwrapped = unwrapRing(pts);

  if (Math.abs(center.lat) + r > 90) {
    return closeRing(unwrapped, 90 * Math.sign(center.lat));
  }
  return unwrapped;
}
