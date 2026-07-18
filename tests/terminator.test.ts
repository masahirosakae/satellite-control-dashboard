import { describe, it, expect } from "vitest";
import { subsolarPoint, terminatorLine, nightPolygon } from "../src/domain/terminator";

// Real equinox/solstice instants (UTC), from published astronomical almanac
// data. Used only to sanity-check the low-precision approximation, not as
// exact ephemeris references — tolerances reflect the ~1 decimal degree the
// dashboard needs, not high-precision ephemeris accuracy.
const MARCH_EQUINOX_2024 = new Date("2024-03-20T03:06:00Z");
const SEPT_EQUINOX_2024 = new Date("2024-09-22T12:44:00Z");
const JUNE_SOLSTICE_2024 = new Date("2024-06-20T20:51:00Z");
const DEC_SOLSTICE_2024 = new Date("2024-12-21T09:20:00Z");

describe("subsolarPoint", () => {
  it("has ~0 declination at the March equinox", () => {
    const p = subsolarPoint(MARCH_EQUINOX_2024);
    expect(Math.abs(p.lat)).toBeLessThan(1.5);
  });

  it("has ~0 declination at the September equinox", () => {
    const p = subsolarPoint(SEPT_EQUINOX_2024);
    expect(Math.abs(p.lat)).toBeLessThan(1.5);
  });

  it("has ~+23.44 declination at the June solstice (northern summer)", () => {
    const p = subsolarPoint(JUNE_SOLSTICE_2024);
    expect(p.lat).toBeGreaterThan(23.44 - 1.5);
    expect(p.lat).toBeLessThanOrEqual(23.44 + 0.5);
  });

  it("has ~-23.44 declination at the December solstice (northern winter)", () => {
    const p = subsolarPoint(DEC_SOLSTICE_2024);
    expect(p.lat).toBeLessThan(-23.44 + 1.5);
    expect(p.lat).toBeGreaterThanOrEqual(-23.44 - 0.5);
  });

  it("flips sign of declination between the summer and winter solstice", () => {
    const june = subsolarPoint(JUNE_SOLSTICE_2024);
    const dec = subsolarPoint(DEC_SOLSTICE_2024);
    expect(june.lat).toBeGreaterThan(0);
    expect(dec.lat).toBeLessThan(0);
  });

  it("returns a longitude within the valid range", () => {
    const p = subsolarPoint(new Date("2026-07-18T14:23:00Z"));
    expect(p.lon).toBeGreaterThanOrEqual(-180);
    expect(p.lon).toBeLessThanOrEqual(180);
  });
});

describe("terminatorLine", () => {
  it("produces one point per longitude step spanning -180..180", () => {
    const line = terminatorLine(JUNE_SOLSTICE_2024, 10);
    expect(line.length).toBeGreaterThan(30);
    expect(line[0].lon).toBe(-180);
    expect(line.at(-1)?.lon).toBe(180);
  });

  it("keeps all latitudes within the valid range", () => {
    const line = terminatorLine(DEC_SOLSTICE_2024, 5);
    for (const p of line) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
    }
  });
});

describe("nightPolygon", () => {
  it("closes at both map edges and wraps the winter pole into permanent night", () => {
    const poly = nightPolygon(JUNE_SOLSTICE_2024, 10);
    expect(poly[0]).toEqual({ lat: -90, lon: -180 });
    expect(poly.at(-1)).toEqual({ lat: -90, lon: 180 });
  });

  it("wraps the opposite pole for the December solstice", () => {
    const poly = nightPolygon(DEC_SOLSTICE_2024, 10);
    expect(poly[0]).toEqual({ lat: 90, lon: -180 });
    expect(poly.at(-1)).toEqual({ lat: 90, lon: 180 });
  });
});
