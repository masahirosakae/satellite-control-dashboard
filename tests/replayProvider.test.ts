import { describe, it, expect } from "vitest";
import { ReplayProvider, type ReplayFixture } from "../src/services/providers/ReplayProvider";
import fixtureJson from "../src/fixtures/sonate2-replay.json";

const fixture = fixtureJson as unknown as ReplayFixture;

describe("ReplayProvider", () => {
  it("returns NO_DATA before the first telemetry frame in the fixture window", () => {
    const provider = new ReplayProvider(fixture);
    const snapshot = provider.getTelemetry(new Date("2026-06-15T12:00:00Z"));
    expect(snapshot.status).toBe("NO_DATA");
  });

  it("returns OK with a mapped field and REPLAY provenance near the end of the window", () => {
    const provider = new ReplayProvider(fixture);
    const snapshot = provider.getTelemetry(new Date("2026-06-15T20:00:00Z"));
    expect(snapshot.status).toBe("OK");
    const vbatField = snapshot.fields.find((f) => f.key === "vbat");
    expect(vbatField).toBeTruthy();
    expect(vbatField?.mapped).toBe(true);
    expect(snapshot.provenance.freshness).toBe("REPLAY");
    expect(snapshot.provenance.isSimulated).toBe(false);
  });

  it("returns exactly one visible observation at the given replay clock", () => {
    const provider = new ReplayProvider(fixture);
    const obsSet = provider.getRecentObservations(new Date("2026-06-15T13:00:00Z"));
    expect(obsSet.observations).toHaveLength(1);
    expect(obsSet.status).toBe("OK");
  });

  it("returns a non-null position from getOrbitState", () => {
    const provider = new ReplayProvider(fixture);
    const state = provider.getOrbitState(new Date(fixture.tle.epoch));
    expect(state.position).not.toBeNull();
    expect(state.error).toBeNull();
  });
});
