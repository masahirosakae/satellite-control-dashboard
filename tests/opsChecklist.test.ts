import { describe, it, expect } from "vitest";
import { buildOpsChecklist } from "../src/domain/opsChecklist";
import type {
  DataProvenance,
  GroundStation,
  OrbitState,
  ProviderHealth,
  ProviderRequestState,
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
    requestState: "SUCCEEDED",
    failureReason: null,
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
    orbitRequest: "SUCCEEDED" as ProviderRequestState,
    telemetry: telemetry(),
    tlmRequest: "SUCCEEDED" as ProviderRequestState,
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
    it("NOT_REQUESTED -> PENDING (never FAIL)", () => {
      const items = buildOpsChecklist(baseInput({ orbitRequest: "NOT_REQUESTED" }));
      expect(itemById(items, "orbit-source").status).toBe("PENDING");
    });

    it("LOADING -> CHECKING (never FAIL)", () => {
      const items = buildOpsChecklist(baseInput({ orbitRequest: "LOADING" }));
      expect(itemById(items, "orbit-source").status).toBe("CHECKING");
    });

    it("FAILED -> FAIL, detail includes orbit.error", () => {
      const items = buildOpsChecklist(
        baseInput({ orbitRequest: "FAILED", orbit: orbit({ error: "network unreachable" }) })
      );
      const item = itemById(items, "orbit-source");
      expect(item.status).toBe("FAIL");
      expect(item.detail).toContain("network unreachable");
    });

    it.each([
      ["LIVE", "PASS"],
      ["SIMULATED", "PASS"],
      ["REPLAY", "PASS"],
      ["DELAYED", "WARN"],
      ["STALE", "WARN"],
      ["UNAVAILABLE", "N_A"],
    ] as const)("SUCCEEDED maps freshness %s to %s", (freshness, expected) => {
      const items = buildOpsChecklist(
        baseInput({ orbitRequest: "SUCCEEDED", orbit: orbit({ provenance: provenance({ freshness }) }) })
      );
      expect(itemById(items, "orbit-source").status).toBe(expected);
    });
  });

  describe("tle-age", () => {
    it("NOT_REQUESTED -> PENDING", () => {
      const items = buildOpsChecklist(baseInput({ orbitRequest: "NOT_REQUESTED" }));
      expect(itemById(items, "tle-age").status).toBe("PENDING");
    });

    it("LOADING -> CHECKING", () => {
      const items = buildOpsChecklist(baseInput({ orbitRequest: "LOADING" }));
      expect(itemById(items, "tle-age").status).toBe("CHECKING");
    });

    it("is N_A when tleAgeHours is null (request settled)", () => {
      const items = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: null }) }));
      expect(itemById(items, "tle-age").status).toBe("N_A");
    });

    it("preserves the freshness thresholds: PASS within live, WARN within delayed, FAIL beyond", () => {
      const passItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 1 }) }));
      expect(itemById(passItems, "tle-age").status).toBe("PASS");

      const warnItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 48 }) }));
      expect(itemById(warnItems, "tle-age").status).toBe("WARN");

      const failItems = buildOpsChecklist(baseInput({ orbit: orbit({ tleAgeHours: 200 }) }));
      expect(itemById(failItems, "tle-age").status).toBe("FAIL");
    });
  });

  describe("telemetry", () => {
    it("NOT_REQUESTED -> PENDING", () => {
      const items = buildOpsChecklist(baseInput({ tlmRequest: "NOT_REQUESTED" }));
      expect(itemById(items, "telemetry").status).toBe("PENDING");
    });

    it("LOADING -> CHECKING", () => {
      const items = buildOpsChecklist(baseInput({ tlmRequest: "LOADING" }));
      expect(itemById(items, "telemetry").status).toBe("CHECKING");
    });

    it("FAILED -> FAIL", () => {
      const items = buildOpsChecklist(baseInput({ tlmRequest: "FAILED" }));
      expect(itemById(items, "telemetry").status).toBe("FAIL");
    });

    it("SUCCEEDED + OK -> PASS", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "OK" }) }));
      expect(itemById(items, "telemetry").status).toBe("PASS");
    });

    it("SUCCEEDED + NO_DATA -> INFO (not critical)", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "NO_DATA" }) }));
      expect(itemById(items, "telemetry").status).toBe("INFO");
    });

    it("SUCCEEDED + TOKEN_MISSING -> CONFIG_REQUIRED (never FAIL), detail mentions the token env var", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "TOKEN_MISSING" }) }));
      const item = itemById(items, "telemetry");
      expect(item.status).toBe("CONFIG_REQUIRED");
      expect(item.detail).toContain("SATNOGS_API_TOKEN");
    });

    it("SUCCEEDED + ERROR -> FAIL, includes the error message", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "ERROR", error: "boom" }) }));
      const item = itemById(items, "telemetry");
      expect(item.status).toBe("FAIL");
      expect(item.detail).toContain("boom");
    });

    it("SUCCEEDED + UNAVAILABLE -> N_A (defensive-only)", () => {
      const items = buildOpsChecklist(baseInput({ telemetry: telemetry({ status: "UNAVAILABLE" }) }));
      expect(itemById(items, "telemetry").status).toBe("N_A");
    });
  });

  describe("providers — precedence FAILED > TOKEN_MISSING > CHECKING > PASS", () => {
    it("is FAIL when any provider requestState is FAILED, even if others are TOKEN_MISSING/loading", () => {
      const items = buildOpsChecklist(
        baseInput({
          health: [
            provider({ providerId: "p1", status: "TOKEN_MISSING" }),
            provider({ providerId: "p2", label: "Bad", status: "ERROR", requestState: "FAILED" }),
            provider({ providerId: "p3", requestState: "LOADING" }),
          ],
        })
      );
      const item = itemById(items, "providers");
      expect(item.status).toBe("FAIL");
      expect(item.detail).toContain("Bad");
    });

    it("is CONFIG_REQUIRED when a provider is TOKEN_MISSING (no FAILED requestState present)", () => {
      const items = buildOpsChecklist(
        baseInput({ health: [provider({ status: "OK" }), provider({ providerId: "p2", status: "TOKEN_MISSING" })] })
      );
      expect(itemById(items, "providers").status).toBe("CONFIG_REQUIRED");
    });

    it("is CHECKING when a provider is still NOT_REQUESTED/LOADING (no FAILED/TOKEN_MISSING present)", () => {
      const items = buildOpsChecklist(
        baseInput({ health: [provider({ status: "OK" }), provider({ providerId: "p2", requestState: "LOADING" })] })
      );
      expect(itemById(items, "providers").status).toBe("CHECKING");
    });

    it("is PASS when all providers are OK and SUCCEEDED", () => {
      const items = buildOpsChecklist(baseInput({ health: [provider(), provider({ providerId: "p2" })] }));
      expect(itemById(items, "providers").status).toBe("PASS");
    });
  });

  describe("stations", () => {
    it("is FAIL when there are no stations", () => {
      const items = buildOpsChecklist(baseInput({ stations: [] }));
      expect(itemById(items, "stations").status).toBe("FAIL");
    });

    it("is PASS with a count in the detail when stations exist", () => {
      const items = buildOpsChecklist(baseInput({ stations: [station("a"), station("b")] }));
      const item = itemById(items, "stations");
      expect(item.status).toBe("PASS");
      expect(item.detail).toContain("2");
    });
  });

  describe("next-contact", () => {
    it("is WARN for NO_WINDOW", () => {
      const items = buildOpsChecklist(baseInput({ phase: noContact }));
      expect(itemById(items, "next-contact").status).toBe("WARN");
    });

    it("is PASS and says 'in contact' for CONTACT", () => {
      const phase: ContactPhaseInfo = {
        phase: "CONTACT",
        activeWindow: { startMs: 0, endMs: 1000, stationIds: ["gs1"] },
        nextWindow: null,
        tToAosMs: null,
        tToLosMs: 500,
      };
      const items = buildOpsChecklist(baseInput({ phase }));
      const item = itemById(items, "next-contact");
      expect(item.status).toBe("PASS");
      expect(item.detail.toLowerCase()).toContain("contact");
    });

    it("is PASS for PREP/IDLE and reports time to AOS", () => {
      const phase: ContactPhaseInfo = {
        phase: "IDLE",
        activeWindow: null,
        nextWindow: { startMs: 1000, endMs: 2000, stationIds: ["gs1"] },
        tToAosMs: 60_000,
        tToLosMs: null,
      };
      const items = buildOpsChecklist(baseInput({ phase }));
      const item = itemById(items, "next-contact");
      expect(item.status).toBe("PASS");
      expect(item.detail).toMatch(/\d/);
    });
  });
});
