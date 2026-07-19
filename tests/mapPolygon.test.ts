import { describe, it, expect } from "vitest";
import { unwrapRing, footprintPolygon, landPolygons } from "../src/domain/mapPolygon";
import { footprintHalfAngleDeg } from "../src/domain/geo";
import worldCoastlines from "../src/assets/world-110m.json";

describe("unwrapRing", () => {
  it("keeps adjacent longitude deltas within 180 degrees and leaves the first point unchanged", () => {
    const ring = [
      { lat: 10, lon: 179 },
      { lat: 11, lon: -179 },
      { lat: -5, lon: -178 },
      { lat: -6, lon: 179 },
    ];
    const out = unwrapRing(ring);
    expect(out[0]).toEqual(ring[0]);
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i].lon - out[i - 1].lon)).toBeLessThanOrEqual(180);
    }
  });
});

function shoelaceArea(poly: { lat: number; lon: number }[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.lon * b.lat - b.lon * a.lat;
  }
  return Math.abs(sum) / 2;
}

describe("footprintPolygon", () => {
  it("has translation-invariant area across the antimeridian (no clipping loss)", () => {
    const areaAtSeam = shoelaceArea(footprintPolygon({ lat: 0, lon: 165 }, 550));
    const areaAtOrigin = shoelaceArea(footprintPolygon({ lat: 0, lon: 0 }, 550));
    expect(areaAtSeam).toBeCloseTo(areaAtOrigin, 0);
    expect(Math.abs(areaAtSeam - areaAtOrigin) / areaAtOrigin).toBeLessThan(0.01);
  });

  it("wraps around the pole when the footprint circle contains it", () => {
    const r = footprintHalfAngleDeg(550);
    expect(r).toBeGreaterThan(20);
    expect(r).toBeLessThan(25);
    const poly = footprintPolygon({ lat: 85, lon: 0 }, 550);
    expect(poly.some((p) => p.lat === 90)).toBe(true);
    const lons = poly.map((p) => p.lon);
    // The circle already traverses nearly the full 360 degrees around the
    // pole before the two cap points close it off at the map border; exact
    // discretized span depends on step count, so just assert it's large.
    expect(Math.max(...lons) - Math.min(...lons)).toBeGreaterThan(300);
  });

  it("returns a polar band for a footprint centered exactly at the pole", () => {
    const r = footprintHalfAngleDeg(550);
    const poly = footprintPolygon({ lat: 90, lon: 0 }, 550);
    const lats = poly.map((p) => p.lat);
    const lons = poly.map((p) => p.lon);
    expect(Math.max(...lats)).toBe(90);
    expect(Math.min(...lats)).toBeCloseTo(90 - r, 5);
    expect(Math.min(...lons)).toBeCloseTo(-180, 5);
    expect(Math.max(...lons)).toBeCloseTo(180, 5);
  });

  it("stays local (no wrap/pole handling) for a footprint away from seams and poles", () => {
    const poly = footprintPolygon({ lat: 0, lon: 0 }, 550);
    for (const p of poly) {
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(30);
    }
    expect(poly.some((p) => Math.abs(p.lat) === 90)).toBe(false);
  });
});

describe("landPolygons (asset regression)", () => {
  it("produces no polygon with an adjacent-point longitude jump greater than 180 degrees, except cap edges lying exactly on the map border", () => {
    const polys = landPolygons(worldCoastlines as number[][][]);
    for (const poly of polys) {
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1];
        const b = poly[i];
        const isCapEdge = Math.abs(a.lat) === 90 && Math.abs(b.lat) === 90;
        if (isCapEdge) continue;
        expect(Math.abs(b.lon - a.lon)).toBeLessThanOrEqual(180);
      }
    }
  });
});

/**
 * Even-odd ray-casting point-in-polygon test, operating directly in
 * (lon, lat) degree space (which is exactly the coordinate space the
 * polygons are expressed in and, after linear px() projection, the space
 * SVG's fill-rule operates on).
 */
function pointInPolygon(poly: { lat: number; lon: number }[], point: { lat: number; lon: number }): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon;
    const yi = poly[i].lat;
    const xj = poly[j].lon;
    const yj = poly[j].lat;
    const intersects = yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

describe("fill regression (pole cap must not leave the polar region unfilled)", () => {
  it("footprintPolygon({lat:85,lon:0}, 550) fills the region near the pole opposite the ring's start", () => {
    const poly = footprintPolygon({ lat: 85, lon: 0 }, 550);
    // Last two vertices are the two appended pole-cap points; the ring
    // itself may unwrap in either lon direction depending on discretized
    // bearing sampling, so probe ~180 degrees around from the start in
    // whichever direction the ring actually travels.
    const nonCap = poly.slice(0, poly.length - 2);
    const firstLon = nonCap[0].lon;
    const lastLon = nonCap[nonCap.length - 1].lon;
    const testPoint = { lat: 88, lon: firstLon + 180 * Math.sign(lastLon - firstLon) };
    expect(pointInPolygon(poly, testPoint)).toBe(true);
  });

  it("landPolygons' pole-capped Antarctica ring fills the polar region opposite the ring's start", () => {
    const polys = landPolygons(worldCoastlines as number[][][]);
    const capPoly = polys.find(
      (p) => p.length >= 2 && Math.abs(p[p.length - 1].lat) === 90 && Math.abs(p[p.length - 2].lat) === 90
    );
    expect(capPoly).toBeDefined();
    const nonCap = capPoly!.slice(0, capPoly!.length - 2);
    const firstLon = nonCap[0].lon;
    const lastLon = nonCap[nonCap.length - 1].lon;
    const pole = capPoly![capPoly!.length - 1].lat;
    const testPoint = { lat: pole > 0 ? 89 : -89, lon: firstLon + 180 * Math.sign(lastLon - firstLon) };
    expect(pointInPolygon(capPoly!, testPoint)).toBe(true);
  });
});
