import { describe, it, expect } from "vitest";
import { orbitFreshness, telemetryFreshness } from "../src/domain/freshness";

const HOUR_MS = 3600_000;

describe("orbitFreshness", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("is LIVE at exactly the 24h boundary", () => {
    const epoch = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
    expect(orbitFreshness(epoch, now)).toBe("LIVE");
  });

  it("is DELAYED just past the 24h boundary", () => {
    const epoch = new Date(now.getTime() - 24 * HOUR_MS - 1).toISOString();
    expect(orbitFreshness(epoch, now)).toBe("DELAYED");
  });

  it("is DELAYED at exactly the 72h boundary", () => {
    const epoch = new Date(now.getTime() - 72 * HOUR_MS).toISOString();
    expect(orbitFreshness(epoch, now)).toBe("DELAYED");
  });

  it("is STALE just past the 72h boundary", () => {
    const epoch = new Date(now.getTime() - 72 * HOUR_MS - 1).toISOString();
    expect(orbitFreshness(epoch, now)).toBe("STALE");
  });

  it("is UNAVAILABLE for null", () => {
    expect(orbitFreshness(null, now)).toBe("UNAVAILABLE");
  });

  it("is UNAVAILABLE for a garbage string", () => {
    expect(orbitFreshness("not-a-date", now)).toBe("UNAVAILABLE");
  });
});

describe("telemetryFreshness", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("is LIVE at exactly the 1h boundary", () => {
    const observedAt = new Date(now.getTime() - 1 * HOUR_MS).toISOString();
    expect(telemetryFreshness(observedAt, now)).toBe("LIVE");
  });

  it("is DELAYED just past the 1h boundary", () => {
    const observedAt = new Date(now.getTime() - 1 * HOUR_MS - 1).toISOString();
    expect(telemetryFreshness(observedAt, now)).toBe("DELAYED");
  });

  it("is DELAYED at exactly the 24h boundary", () => {
    const observedAt = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
    expect(telemetryFreshness(observedAt, now)).toBe("DELAYED");
  });

  it("is STALE just past the 24h boundary", () => {
    const observedAt = new Date(now.getTime() - 24 * HOUR_MS - 1).toISOString();
    expect(telemetryFreshness(observedAt, now)).toBe("STALE");
  });

  it("is UNAVAILABLE for null", () => {
    expect(telemetryFreshness(null, now)).toBe("UNAVAILABLE");
  });

  it("is UNAVAILABLE for a garbage string", () => {
    expect(telemetryFreshness("garbage", now)).toBe("UNAVAILABLE");
  });
});
