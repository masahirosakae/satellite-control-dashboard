import { describe, it, expect } from "vitest";
import { footprintHalfAngleDeg, footprintCircle, greatCircleKm, R_EARTH_KM, d2r } from "../src/domain/geo";

describe("footprintHalfAngleDeg", () => {
  it("is ~23 degrees at a typical LEO altitude (550 km)", () => {
    expect(footprintHalfAngleDeg(550)).toBeGreaterThan(22);
    expect(footprintHalfAngleDeg(550)).toBeLessThan(24);
  });

  it("is ~81 degrees at geostationary altitude (35786 km)", () => {
    expect(footprintHalfAngleDeg(35786)).toBeGreaterThan(80);
    expect(footprintHalfAngleDeg(35786)).toBeLessThan(82);
  });

  it("grows monotonically with altitude", () => {
    const low = footprintHalfAngleDeg(400);
    const mid = footprintHalfAngleDeg(2000);
    const high = footprintHalfAngleDeg(35786);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("approaches 0 degrees as altitude approaches 0", () => {
    expect(footprintHalfAngleDeg(0.001)).toBeLessThan(1);
  });
});

describe("footprintCircle", () => {
  it("returns a closed polygon of the requested resolution", () => {
    const poly = footprintCircle({ lat: 0, lon: 0 }, 550, 36);
    expect(poly.length).toBe(37);
    expect(poly[0].lat).toBeCloseTo(poly.at(-1)!.lat, 5);
    expect(poly[0].lon).toBeCloseTo(poly.at(-1)!.lon, 5);
  });

  it("every point sits at the expected great-circle distance from the center", () => {
    const center = { lat: 10, lon: 20 };
    const altKm = 550;
    const poly = footprintCircle(center, altKm, 16);
    const expectedRadiusKm = d2r(footprintHalfAngleDeg(altKm)) * R_EARTH_KM;
    for (const p of poly) {
      expect(greatCircleKm(center, p)).toBeCloseTo(expectedRadiusKm, 1);
    }
  });
});
