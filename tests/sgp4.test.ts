import { describe, it, expect } from "vitest";
import { Sgp4OrbitEngine } from "../src/services/orbit/Sgp4OrbitEngine";
import fixture from "../src/fixtures/sonate2-replay.json";

const { line1, line2, epoch } = fixture.tle;

describe("Sgp4OrbitEngine", () => {
  const engine = new Sgp4OrbitEngine(line1, line2);
  const epochDate = new Date(epoch);
  const tPlus10Min = new Date(epochDate.getTime() + 10 * 60 * 1000);

  it("propagates a non-null position shortly after epoch", () => {
    const pos = engine.positionAt(tPlus10Min);
    expect(pos).not.toBeNull();
  });

  it("returns plausible LEO orbital elements", () => {
    const pos = engine.positionAt(tPlus10Min);
    expect(pos).not.toBeNull();
    if (!pos) return;
    expect(pos.altKm).toBeGreaterThanOrEqual(300);
    expect(pos.altKm).toBeLessThanOrEqual(700);
    expect(pos.lat).toBeGreaterThanOrEqual(-98);
    expect(pos.lat).toBeLessThanOrEqual(98);
    expect(pos.lon).toBeGreaterThanOrEqual(-180);
    expect(pos.lon).toBeLessThanOrEqual(180);
    expect(pos.velocityKmS).toBeGreaterThanOrEqual(6.5);
    expect(pos.velocityKmS).toBeLessThanOrEqual(8.5);
  });

  it("computes a plausible orbital period", () => {
    const period = engine.periodMinutes();
    expect(period).toBeGreaterThanOrEqual(85);
    expect(period).toBeLessThanOrEqual(105);
  });

  it("groundTrack returns many sampled points", () => {
    const periodS = engine.periodMinutes() * 60;
    const track = engine.groundTrack(epochDate, periodS * 2, 45);
    expect(track.length).toBeGreaterThan(50);
    for (const p of track) {
      expect(p.lat).toBeGreaterThanOrEqual(-98);
      expect(p.lat).toBeLessThanOrEqual(98);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThanOrEqual(180);
    }
  });
});
