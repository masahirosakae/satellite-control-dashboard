import { describe, it, expect, vi } from "vitest";
import { CelesTrakOrbitProvider } from "../src/services/providers/CelesTrakOrbitProvider";
import { SatNogsTelemetryProvider } from "../src/services/providers/SatNogsTelemetryProvider";
import { ReplayProvider, type ReplayFixture } from "../src/services/providers/ReplayProvider";
import type { MissionApi } from "../src/services/api/missionApi";
import type { SatelliteProfile } from "../src/domain/types";

const PROFILE: SatelliteProfile = {
  name: "SONATE-2",
  noradId: 59112,
  mode: "LIVE_READ_ONLY",
  purpose: "test",
};

const VALID_ORBIT_RESP = {
  noradId: 59112,
  name: "SONATE-2",
  tleLine1: "1 59112U 24043AK  26166.50000000  .00012000  00000+0  55000-3 0  9992",
  tleLine2: "2 59112  97.4500 245.5000 0011000  95.0000 265.2000 15.25000000123450",
  epoch: "2026-06-15T12:00:00.000Z",
  fetchedAt: "2026-06-15T12:00:00.000Z",
  source: "celestrak",
  sourceUrl: "https://celestrak.org",
  staleCache: false,
  fetchError: null,
};

// Obviously-invalid TLE: eccentricity field corrupted to 0.9999999 makes
// satellite.js's twoline2satrec set satrec.error !== 0, so
// Sgp4OrbitEngine's constructor throws.
const INVALID_ORBIT_RESP = {
  ...VALID_ORBIT_RESP,
  tleLine2: "2 59112  97.4500 245.5000 9999999  95.0000 265.2000 15.25000000123450",
};

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

describe("CelesTrakOrbitProvider — request lifecycle", () => {
  it("starts NOT_REQUESTED", () => {
    const api = { getOrbit: vi.fn() } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, PROFILE);
    expect(provider.getProviderHealth()[0].requestState).toBe("NOT_REQUESTED");
    expect(provider.getProviderHealth()[0].failureReason).toBeNull();
  });

  it("is LOADING while refresh() is in flight", async () => {
    const api = { getOrbit: vi.fn(() => neverResolves()) } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, PROFILE);
    const p = provider.refresh(new Date());
    // Synchronously after calling refresh (before the microtask queue
    // drains), requestState must already be LOADING.
    expect(provider.getProviderHealth()[0].requestState).toBe("LOADING");
    void p; // never resolves in this test — leave it dangling
  });

  it("is SUCCEEDED after a resolved valid response", async () => {
    const api = { getOrbit: vi.fn(() => Promise.resolve(VALID_ORBIT_RESP)) } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, PROFILE);
    await provider.refresh(new Date());
    const h = provider.getProviderHealth()[0];
    expect(h.requestState).toBe("SUCCEEDED");
    expect(h.failureReason).toBeNull();
  });

  it("is FAILED + FETCH_FAILED after api.getOrbit() rejects", async () => {
    const api = { getOrbit: vi.fn(() => Promise.reject(new Error("network down"))) } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, PROFILE);
    await provider.refresh(new Date());
    const h = provider.getProviderHealth()[0];
    expect(h.requestState).toBe("FAILED");
    expect(h.failureReason).toBe("FETCH_FAILED");
  });

  it("is FAILED + PARSE_FAILED when the fetched TLE makes Sgp4OrbitEngine throw", async () => {
    const api = { getOrbit: vi.fn(() => Promise.resolve(INVALID_ORBIT_RESP)) } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, PROFILE);
    await provider.refresh(new Date());
    const h = provider.getProviderHealth()[0];
    expect(h.requestState).toBe("FAILED");
    expect(h.failureReason).toBe("PARSE_FAILED");
  });

  it("stays NOT_REQUESTED after refresh() when the profile has no noradId (no request is ever made)", async () => {
    const getOrbitMock = vi.fn(() => Promise.resolve(VALID_ORBIT_RESP));
    const api = { getOrbit: getOrbitMock } as unknown as MissionApi;
    const provider = new CelesTrakOrbitProvider(api, { ...PROFILE, noradId: null });
    await provider.refresh(new Date());
    const h = provider.getProviderHealth()[0];
    expect(h.requestState).toBe("NOT_REQUESTED");
    expect(h.failureReason).toBeNull();
    expect(getOrbitMock).not.toHaveBeenCalled();
  });
});

describe("SatNogsTelemetryProvider — request lifecycle", () => {
  const noradId = 59112;

  it.each(["TOKEN_MISSING", "NO_DATA", "OK"] as const)(
    "is SUCCEEDED after a resolved status=%s response",
    async (status) => {
      const resp =
        status === "OK"
          ? {
              status: "OK" as const,
              fetchedAt: "2026-06-15T12:00:00.000Z",
              source: "satnogs-db",
              sourceUrl: "https://x",
              entries: [],
              error: null,
            }
          : {
              status,
              fetchedAt: "2026-06-15T12:00:00.000Z",
              source: "satnogs-db",
              sourceUrl: "https://x",
              entries: [],
              error: null,
            };
      const api = { getTelemetry: vi.fn(() => Promise.resolve(resp)) } as unknown as MissionApi;
      const provider = new SatNogsTelemetryProvider(api, noradId);
      await provider.refresh(new Date());
      const h = provider.getProviderHealth();
      expect(h.requestState).toBe("SUCCEEDED");
      expect(h.failureReason).toBeNull();
    }
  );

  it("is FAILED + FETCH_FAILED when the resolved response has status=ERROR", async () => {
    const resp = {
      status: "ERROR" as const,
      fetchedAt: "2026-06-15T12:00:00.000Z",
      source: "satnogs-db",
      sourceUrl: "https://x",
      entries: [],
      error: "upstream 500",
    };
    const api = { getTelemetry: vi.fn(() => Promise.resolve(resp)) } as unknown as MissionApi;
    const provider = new SatNogsTelemetryProvider(api, noradId);
    await provider.refresh(new Date());
    const h = provider.getProviderHealth();
    expect(h.requestState).toBe("FAILED");
    expect(h.failureReason).toBe("FETCH_FAILED");
  });

  it("is FAILED + FETCH_FAILED when getTelemetry() rejects", async () => {
    const api = { getTelemetry: vi.fn(() => Promise.reject(new Error("network down"))) } as unknown as MissionApi;
    const provider = new SatNogsTelemetryProvider(api, noradId);
    await provider.refresh(new Date());
    const h = provider.getProviderHealth();
    expect(h.requestState).toBe("FAILED");
    expect(h.failureReason).toBe("FETCH_FAILED");
  });
});

describe("ReplayProvider — request lifecycle (health reflects fixture TLE init)", () => {
  const VALID_FIXTURE: ReplayFixture = {
    profile: { name: "SONATE-2", noradId: 59112, purpose: "test" },
    tle: {
      line1: "1 59112U 24043AK  26166.50000000  .00012000  00000+0  55000-3 0  9992",
      line2: "2 59112  97.4500 245.5000 0011000  95.0000 265.2000 15.25000000123450",
      name: "SONATE-2",
      noradId: 59112,
      epoch: "2026-06-15T12:00:00.000Z",
    },
    start: "2026-06-15T00:00:00.000Z",
    end: "2026-06-16T00:00:00.000Z",
    observations: [],
    telemetryFrames: [],
  };

  // Same corruption technique as INVALID_ORBIT_RESP above: eccentricity
  // field set to 0.9999999 makes satellite.js's twoline2satrec set
  // satrec.error !== 0, so Sgp4OrbitEngine's constructor throws — and
  // ReplayProvider's constructor catches that into `initError` / leaves
  // `this.engine` null.
  const CORRUPT_FIXTURE: ReplayFixture = {
    ...VALID_FIXTURE,
    tle: { ...VALID_FIXTURE.tle, line2: "2 59112  97.4500 245.5000 9999999  95.0000 265.2000 15.25000000123450" },
  };

  it("reports SUCCEEDED/null when the fixture TLE initializes cleanly", () => {
    const provider = new ReplayProvider(VALID_FIXTURE);
    const h = provider.getProviderHealth()[0];
    expect(h.status).toBe("OK");
    expect(h.requestState).toBe("SUCCEEDED");
    expect(h.failureReason).toBeNull();
  });

  it("reports FAILED/PARSE_FAILED (and status ERROR) when the fixture TLE fails to initialize", () => {
    const provider = new ReplayProvider(CORRUPT_FIXTURE);
    const h = provider.getProviderHealth()[0];
    expect(h.status).toBe("ERROR");
    expect(h.requestState).toBe("FAILED");
    expect(h.failureReason).toBe("PARSE_FAILED");
  });
});
