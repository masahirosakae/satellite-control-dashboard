import { describe, it, expect } from "vitest";
import { buildOpsChecklist } from "../src/domain/opsChecklist";
import type {
  DataProvenance,
  GroundStation,
  OrbitState,
  ProviderHealth,
  TelemetrySnapshot,
} from "../src/domain/types";
import type { ContactPhaseInfo } from "../src/domain/contactPhase";

function provenance(overrides: Partial<DataProvenance> = {}): DataProvenance {
  return {
    source: "test",
    sourceName: "Test Source",
    observedAt: null,
    fetchedAt: null,
    dataMode: "SIMULATED",
    freshness: "LIVE",
    isSimulated: false,
    hasRawPayload: false,
    ...overrides,
  };
}

function orbit(overrides: Partial<OrbitState> = {}): OrbitState {
  return {
    provenance: provenance(),
    tle: null,
    tleAgeHours: null,
    position: null,
    track: [],
    trackStartMs: null,
    trackStepS: null,
    error: null,
    ...overrides,
  };
}

function telemetry(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    provenance: provenance(),
    status: "OK",
    observedAt: null,
    decoder: null,
    fields: [],
    rawFrame: null,
    error: null,
    ...overrides,
  };
}

function station(id: string): GroundStation {
  return { id, name: id, lat: 0, lon: 0, altM: 0, minElevationDeg: 5, isSample: true };
}

function provider(overrides: Partial<ProviderHealth> = {}): ProviderHealth {
  return {
    providerId: "p",
    label: "Provider",
    status: "OK",
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    detail: null,
    ...overrides,
  };
}

const noContact: ContactPhaseInfo = {
  phase: "NO_WINDOW",
  activeWindow: null,
  nextWindow: null,
  tToAosMs: null,
  tToLosMs: null,
};

function baseInput(overrides: Partial<Parameters<typeof buildOpsChecklist>[0]> = {}) {
  return {
    orbit: orbit(),
    telemetry: telemetry(),
    health: [provider()],
    stations: [station("gs1")],
    phase: noContact,
    ...overrides,
  };
}

function itemById(items: ReturnType<typeof buildOpsChecklist>, id: string) {
  const item = items.find((i) => i.id === id);
  expect(item).toBeDefined();
  return item!;
}

describe("buildOpsChecklist", () => {
  it("produces exactly the 6 expected items in order", () => {
    const items = buildOpsChecklist(baseInput());
    expect(items.map((i) => i.id)).toEqual(["orbit-source", "tle-age", "telemetry", "providers", "stations", "next-contact"]);
  });

  describe("orbit-source", () => {
    it.each([
      ["LIVE", "OK"],
      ["SIMULATED", "OK"],
      ["REPLAY", "OK"],
      ["DELAYED", "WARN"],
      ["STALE", "WARN"],
      ["UNAVAILABLE", "FAIL"],
    ] as const)("maps freshness %s to %s", (freshness, expected) => {
      const items = buildOpsChecklist(baseInput({ orbit: orbit({ provenance: provenance({ freshness }) }) }));
      expect(itemById(items, "orbit-source").status).toBe(expected);
    });
  });

  describe("tle-age", () => {
    it("is N_A when tleAgeHours is null", () => {
      const items = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: null }) }));
      expect(itemById(items, "tle-age").status).toBe("N_A");
    });

    it("is OK within the live threshold, WARN within delayed, FAIL beyond", () => {
      const okItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 1 }) }));
      expect(itemById(okItems, "tle-age").status).toBe("OK");

      const warnItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 48 }) }));
      expect(itemById(warnItems, "tle-age").status).toBe("WARN");

      const failItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 200 }) }));
      expect(itemById(failItems, "tle-age").status).toBe("FAIL");
    });
  });

  describe("telemetry", () => {
    it.each([
      ["OK", "OK"],
      ["NO_DATA", "WARN"],
      ["TOKEN_MISSING", "WARN"],
      ["ERROR", "FAIL"],
      ["UNAVAILABLE", "FAIL"],
    ] as const)("maps status %s to %s", (status, expected) => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status }) }));
      expect(itemById(items, "telemetry").status).toBe(expected);
    });

    it("explains that a token is required for TOKEN_MISSING", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "TOKEN_MISSING" }) }));
      expect(itemById(items, "telemetry").detail.toLowerCase()).toContain("token");
    });

    it("includes the error message when present", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "ERROR", error: "boom" }) }));
      expect(itemById(items, "telemetry").detail).toContain("boom");
    });
  });

  describe("providers", () => {
    it("is FAIL when any provider is in ERROR", () => {
      const items = buildOpsChecklist(
        baseInput({ health: [provider({ status: "OK" }), provider({ providerId: "p2", label: "Bad", status: "ERROR" })] })
      );
      const item = itemById(items, "providers");
      expect(item.status).toBe("FAIL");
      expect(item.detail).toContain("Bad");
    });

    it("is WARN when a provider is DEGRADED or TOKEN_MISSING (no ERROR present)", () => {
      const items = buildOpsChecklist(baseInput({ health: [provider({ status: "OK" }), provider({ providerId: "p2", status: "TOKEN_MISSING" })] }));
      expect(itemById(items, "providers").status).toBe("WARN");
    });

    it("is OK when all providers are OK", () => {
      const items = buildOpsChecklist(baseInput({ health: [provider(), provider({ providerId: "p2" })] }));
      expect(itemById(items, "providers").status).toBe("OK");
    });
  });

  describe("stations", () => {
    it("is FAIL when there are no stations", () => {
      const items = buildOpsChecklist(baseInput({ stations: [] }));
      expect(itemById(items, "stations").status).toBe("FAIL");
    });

    it("is OK with a count in the detail when stations exist", () => {
      const items = buildOpsChecklist(baseInput({ stations: [station("a"), station("b")] }));
      const item = itemById(items, "stations");
      expect(item.status).toBe("OK");
      expect(item.detail).toContain("2");
    });
  });

  describe("next-contact", () => {
    it("is WARN for NO_WINDOW", () => {
      const items = buildOpsChecklist(baseInput({ phase: noContact }));
      expect(itemById(items, "next-contact").status).toBe("WARN");
    });

    it("is OK and says 'in contact' for CONTACT", () => {
      const phase: ContactPhaseInfo = {
        phase: "CONTACT",
        activeWindow: { startMs: 0, endMs: 1000, stationIds: ["gs1"] },
        nextWindow: null,
        tToAosMs: null,
        tToLosMs: 500,
      };
      const items = buildOpsChecklist(baseInput({ phase }));
      const item = itemById(items, "next-contact");
      expect(item.status).toBe("OK");
      expect(item.detail.toLowerCase()).toContain("contact");
    });

    it("is OK for PREP/IDLE and reports time to AOS", () => {
      const phase: ContactPhaseInfo = {
        phase: "IDLE",
        activeWindow: null,
        nextWindow: { startMs: 1000, endMs: 2000, stationIds: ["gs1"] },
        tToAosMs: 60_000,
        tToLosMs: null,
      };
      const items = buildOpsChecklist(baseInput({ phase }));
      const item = itemById(items, "next-contact");
      expect(item.status).toBe("OK");
      expect(item.detail).toMatch(/\d/);
    });
  });
});
