import { describe, it, expect } from "vitest";
import { Sgp4OrbitEngine } from "../src/services/orbit/Sgp4OrbitEngine";
import { predictPassesForStation } from "../src/services/orbit/PassPredictionService";
import type { GroundStation } from "../src/domain/types";
import fixture from "../src/fixtures/sonate2-replay.json";

const { line1, line2, epoch } = fixture.tle;

const UCHINOURA: GroundStation = {
  id: "GS1",
  name: "UCHINOURA",
  lat: 31.25,
  lon: 131.08,
  altM: 220,
  minElevationDeg: 10,
  isSample: true,
};

describe("predictPassesForStation", () => {
  const engine = new Sgp4OrbitEngine(line1, line2);
  const start = new Date(epoch);
  const horizonS = 24 * 3600;

  it("finds at least one pass over a 24h horizon", () => {
    const passes = predictPassesForStation(engine, UCHINOURA, start, { horizonS });
    expect(passes.length).toBeGreaterThanOrEqual(1);
  });

  it("returns internally consistent pass records", () => {
    const passes = predictPassesForStation(engine, UCHINOURA, start, { horizonS });
    expect(passes.length).toBeGreaterThan(0);
    for (const pass of passes) {
      expect(Date.parse(pass.aos)).toBeLessThan(Date.parse(pass.los));
      expect(pass.durationS).toBeGreaterThan(0);
      expect(pass.durationS).toBeLessThan(1200);
      expect(pass.maxElevationDeg).toBeGreaterThanOrEqual(9.5);
      expect(pass.aosAzimuthDeg).toBeGreaterThanOrEqual(0);
      expect(pass.aosAzimuthDeg).toBeLessThan(360);
      expect(pass.losAzimuthDeg).toBeGreaterThanOrEqual(0);
      expect(pass.losAzimuthDeg).toBeLessThan(360);
    }
  });

  it("honors a stricter elevation mask by yielding fewer or equal passes", () => {
    const passesLowMask = predictPassesForStation(engine, UCHINOURA, start, { horizonS });
    const highMaskStation: GroundStation = { ...UCHINOURA, minElevationDeg: 60 };
    const passesHighMask = predictPassesForStation(engine, highMaskStation, start, { horizonS });
    expect(passesHighMask.length).toBeLessThanOrEqual(passesLowMask.length);
  });
});
