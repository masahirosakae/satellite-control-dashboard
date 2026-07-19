import { describe, it, expect } from "vitest";
import { deriveAdvisories, reconcileAcks } from "../src/domain/advisory";
import type { DataProvenance, OrbitState, ProviderHealth, TelemetrySnapshot } from "../src/domain/types";
import type { FreshnessStatus } from "../src/domain/types";

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

function baseInput(overrides: Partial<Parameters<typeof deriveAdvisories>[0]> = {}) {
  return {
    orbit: orbit(),
    telemetry: telemetry(),
    health: [],
    ...overrides,
  };
}

describe("deriveAdvisories", () => {
  it("fires orbit-stale WARN when orbit freshness is STALE", () => {
    const advisories = deriveAdvisories(baseInput({ orbit: orbit({ provenance: provenance({ freshness: "STALE" }) }) }));
    const a = advisories.find((x) => x.id === "orbit-stale");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("fires orbit-unavailable CRITICAL when orbit freshness is UNAVAILABLE", () => {
    const advisories = deriveAdvisories(baseInput({ orbit: orbit({ provenance: provenance({ freshness: "UNAVAILABLE" }) }) }));
    const a = advisories.find((x) => x.id === "orbit-unavailable");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });

  it.each(["LIVE", "DELAYED", "SIMULATED", "REPLAY"] as FreshnessStatus[])(
    "does not fire any orbit advisory for freshness %s",
    (freshness) => {
      const advisories = deriveAdvisories(baseInput({ orbit: orbit({ provenance: provenance({ freshness }) }) }));
      expect(advisories.find((x) => x.id === "orbit-stale")).toBeUndefined();
      expect(advisories.find((x) => x.id === "orbit-unavailable")).toBeUndefined();
    }
  );

  it("fires tlm-stale WARN when telemetry freshness is STALE (status OK)", () => {
    const advisories = deriveAdvisories(
      baseInput({ telemetry: telemetry({ provenance: provenance({ freshness: "STALE" }), status: "OK" }) })
    );
    const a = advisories.find((x) => x.id === "tlm-stale");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it.each(["LIVE", "DELAYED", "SIMULATED", "REPLAY"] as FreshnessStatus[])(
    "does not fire tlm-stale for freshness %s",
    (freshness) => {
      const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ provenance: provenance({ freshness }) }) }));
      expect(advisories.find((x) => x.id === "tlm-stale")).toBeUndefined();
    }
  );

  it("fires tlm-token-missing WARN with a token explanation", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "TOKEN_MISSING" }) }));
    const a = advisories.find((x) => x.id === "tlm-token-missing");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
    expect(a!.detail.toLowerCase()).toContain("token");
  });

  it("fires tlm-error CRITICAL including the error message", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "ERROR", error: "decode failure" }) }));
    const a = advisories.find((x) => x.id === "tlm-error");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
    expect(a!.detail).toContain("decode failure");
  });

  it("fires tlm-unavailable CRITICAL", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "UNAVAILABLE" }) }));
    const a = advisories.find((x) => x.id === "tlm-unavailable");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });

  it("suppresses tlm-stale when telemetry.status already produced tlm-unavailable", () => {
    const advisories = deriveAdvisories(
      baseInput({ telemetry: telemetry({ status: "UNAVAILABLE", provenance: provenance({ freshness: "STALE" }) }) })
    );
    expect(advisories.find((x) => x.id === "tlm-unavailable")).toBeDefined();
    expect(advisories.find((x) => x.id === "tlm-stale")).toBeUndefined();
  });

  it("fires provider-error:<id> CRITICAL including lastError", () => {
    const advisories = deriveAdvisories(
      baseInput({ health: [provider({ providerId: "celestrak", label: "CelesTrak", status: "ERROR", lastError: "timeout" })] })
    );
    const a = advisories.find((x) => x.id === "provider-error:celestrak");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
    expect(a!.detail).toContain("timeout");
  });

  it("fires provider-token:<id> WARN", () => {
    const advisories = deriveAdvisories(
      baseInput({ health: [provider({ providerId: "satnogs", label: "SatNOGS", status: "TOKEN_MISSING" })] })
    );
    const a = advisories.find((x) => x.id === "provider-token:satnogs");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("does not fire provider advisories for OK/DEGRADED/IDLE providers", () => {
    const advisories = deriveAdvisories(
      baseInput({
        health: [
          provider({ providerId: "a", status: "OK" }),
          provider({ providerId: "b", status: "DEGRADED" }),
          provider({ providerId: "c", status: "IDLE" }),
        ],
      })
    );
    expect(advisories).toHaveLength(0);
  });

  it("orders CRITICAL advisories before WARN advisories", () => {
    const advisories = deriveAdvisories(
      baseInput({
        orbit: orbit({ provenance: provenance({ freshness: "STALE" }) }), // WARN
        telemetry: telemetry({ status: "ERROR", error: "boom" }), // CRITICAL
        health: [provider({ providerId: "x", status: "TOKEN_MISSING" })], // WARN
      })
    );
    expect(advisories.length).toBeGreaterThanOrEqual(3);
    const firstWarnIndex = advisories.findIndex((a) => a.severity === "WARN");
    const lastCriticalIndex =
      advisories.length - 1 - [...advisories].reverse().findIndex((a) => a.severity === "CRITICAL");
    expect(lastCriticalIndex).toBeLessThan(firstWarnIndex);
  });

  it("produces a full advisory set with correct id/severity for every condition simultaneously", () => {
    const advisories = deriveAdvisories({
      orbit: orbit({ provenance: provenance({ freshness: "UNAVAILABLE" }) }),
      telemetry: telemetry({ status: "TOKEN_MISSING" }),
      health: [
        provider({ providerId: "p1", label: "P1", status: "ERROR", lastError: "net down" }),
        provider({ providerId: "p2", label: "P2", status: "TOKEN_MISSING" }),
      ],
    });
    const byId = new Map(advisories.map((a) => [a.id, a]));
    expect(byId.get("orbit-unavailable")?.severity).toBe("CRITICAL");
    expect(byId.get("tlm-token-missing")?.severity).toBe("WARN");
    expect(byId.get("provider-error:p1")?.severity).toBe("CRITICAL");
    expect(byId.get("provider-token:p2")?.severity).toBe("WARN");
    // CRITICAL-first overall ordering
    const severities = advisories.map((a) => a.severity);
    const firstWarn = severities.indexOf("WARN");
    expect(severities.slice(0, firstWarn).every((s) => s === "CRITICAL")).toBe(true);
  });
});

describe("reconcileAcks", () => {
  it("drops acks for ids no longer active (recurrence re-raises)", () => {
    const acked = new Set(["a", "b"]);
    const result = reconcileAcks(acked, ["a"]);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
  });

  it("keeps acks for still-active ids", () => {
    const acked = new Set(["a", "b"]);
    const result = reconcileAcks(acked, ["a", "b", "c"]);
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("returns an empty set when nothing is currently active", () => {
    const acked = new Set(["a"]);
    expect(reconcileAcks(acked, []).size).toBe(0);
  });

  it("returns an empty set when nothing was acked", () => {
    expect(reconcileAcks(new Set(), ["a", "b"]).size).toBe(0);
  });
});
