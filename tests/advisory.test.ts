import { describe, it, expect } from "vitest";
import { deriveAdvisories, reconcileAcks } from "../src/domain/advisory";
import type {
  DataProvenance,
  MissionMode,
  OrbitState,
  ProviderHealth,
  ProviderRequestState,
  TelemetrySnapshot,
} from "../src/domain/types";
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
    requestState: "SUCCEEDED",
    failureReason: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof deriveAdvisories>[0]> = {}) {
  return {
    mode: "LIVE_READ_ONLY" as MissionMode,
    orbit: orbit(),
    orbitRequest: "SUCCEEDED" as ProviderRequestState,
    telemetry: telemetry(),
    tlmRequest: "SUCCEEDED" as ProviderRequestState,
    health: [],
    ...overrides,
  };
}

describe("deriveAdvisories — request-lifecycle gating", () => {
  it.each(["NOT_REQUESTED", "LOADING"] as ProviderRequestState[])(
    "emits nothing for orbit when orbitRequest is %s, even with UNAVAILABLE freshness",
    (state) => {
      const advisories = deriveAdvisories(
        baseInput({ orbit: orbit({ provenance: provenance({ freshness: "UNAVAILABLE" }) }), orbitRequest: state })
      );
      expect(advisories.filter((a) => a.id.includes(":orbit:"))).toHaveLength(0);
    }
  );

  it.each(["NOT_REQUESTED", "LOADING"] as ProviderRequestState[])(
    "emits nothing for telemetry when tlmRequest is %s, even with UNAVAILABLE status",
    (state) => {
      const advisories = deriveAdvisories(
        baseInput({ telemetry: telemetry({ status: "UNAVAILABLE" }), tlmRequest: state })
      );
      expect(advisories.filter((a) => a.id.includes(":tlm:"))).toHaveLength(0);
    }
  );
});

describe("deriveAdvisories — orbit", () => {
  it("fires :orbit:stale WARN when orbitRequest SUCCEEDED and freshness STALE", () => {
    const advisories = deriveAdvisories(
      baseInput({ orbit: orbit({ provenance: provenance({ freshness: "STALE" }) }), orbitRequest: "SUCCEEDED" })
    );
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:orbit:stale");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("fires CRITICAL orbit advisory with default fetch-failed reason when orbitRequest FAILED and no health entry", () => {
    const advisories = deriveAdvisories(baseInput({ orbitRequest: "FAILED" }));
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:orbit:fetch-failed");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });

  it("fires CRITICAL orbit advisory with parse-failed reason when celestrak-orbit health says PARSE_FAILED", () => {
    const advisories = deriveAdvisories(
      baseInput({
        orbitRequest: "FAILED",
        health: [
          provider({ providerId: "celestrak-orbit", requestState: "FAILED", status: "ERROR", failureReason: "PARSE_FAILED" }),
        ],
      })
    );
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:orbit:parse-failed");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });

  it.each(["LIVE", "DELAYED", "SIMULATED", "REPLAY"] as FreshnessStatus[])(
    "does not fire any orbit advisory for SUCCEEDED + freshness %s",
    (freshness) => {
      const advisories = deriveAdvisories(
        baseInput({ orbit: orbit({ provenance: provenance({ freshness }) }), orbitRequest: "SUCCEEDED" })
      );
      expect(advisories.filter((a) => a.id.includes(":orbit:"))).toHaveLength(0);
    }
  );

  it("does not fire an orbit advisory for SUCCEEDED + UNAVAILABLE (defensive)", () => {
    const advisories = deriveAdvisories(
      baseInput({ orbit: orbit({ provenance: provenance({ freshness: "UNAVAILABLE" }) }), orbitRequest: "SUCCEEDED" })
    );
    expect(advisories.filter((a) => a.id.includes(":orbit:"))).toHaveLength(0);
  });
});

describe("deriveAdvisories — telemetry", () => {
  it("does not fire for SUCCEEDED + NO_DATA (not critical)", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "NO_DATA" }) }));
    expect(advisories.filter((a) => a.id.includes(":tlm:"))).toHaveLength(0);
  });

  it("fires :tlm:token-missing WARN (not CRITICAL) for SUCCEEDED + TOKEN_MISSING", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "TOKEN_MISSING" }) }));
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:tlm:token-missing");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("fires :tlm:error CRITICAL for SUCCEEDED + ERROR", () => {
    const advisories = deriveAdvisories(baseInput({ telemetry: telemetry({ status: "ERROR", error: "decode failure" }) }));
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:tlm:error");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
    expect(a!.detail).toContain("decode failure");
  });

  it("fires :tlm:stale WARN for SUCCEEDED + OK + STALE freshness", () => {
    const advisories = deriveAdvisories(
      baseInput({ telemetry: telemetry({ status: "OK", provenance: provenance({ freshness: "STALE" }) }) })
    );
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:tlm:stale");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("fires :tlm:fetch-failed CRITICAL when tlmRequest FAILED", () => {
    const advisories = deriveAdvisories(baseInput({ tlmRequest: "FAILED" }));
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:tlm:fetch-failed");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });
});

describe("deriveAdvisories — provider dedup", () => {
  it("suppresses celestrak-orbit provider advisory when the orbit data-product advisory already fired", () => {
    const advisories = deriveAdvisories(
      baseInput({
        orbitRequest: "FAILED",
        health: [
          provider({ providerId: "celestrak-orbit", requestState: "FAILED", status: "ERROR", lastError: "timeout" }),
        ],
      })
    );
    const providerAdvisories = advisories.filter((a) => a.id.includes(":provider:celestrak-orbit:"));
    expect(providerAdvisories).toHaveLength(0);
    // the orbit-domain advisory still fired exactly once
    expect(advisories.filter((a) => a.id.includes(":orbit:"))).toHaveLength(1);
  });

  it("always fires satnogs-observations provider advisory (no data-product mapping)", () => {
    const advisories = deriveAdvisories(
      baseInput({
        health: [
          provider({ providerId: "satnogs-observations", requestState: "FAILED", status: "ERROR", lastError: "timeout" }),
        ],
      })
    );
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:provider:satnogs-observations:error");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
  });

  it("fires satnogs-telemetry provider TOKEN_MISSING WARN when not deduped by a tlm data-product advisory", () => {
    const advisories = deriveAdvisories(
      baseInput({
        tlmRequest: "SUCCEEDED",
        telemetry: telemetry({ status: "OK" }),
        health: [
          provider({ providerId: "satnogs-telemetry", requestState: "FAILED", status: "TOKEN_MISSING" }),
        ],
      })
    );
    const a = advisories.find((x) => x.id === "LIVE_READ_ONLY:provider:satnogs-telemetry:token-missing");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("WARN");
  });

  it("does not fire provider advisories when requestState is not FAILED", () => {
    const advisories = deriveAdvisories(
      baseInput({
        health: [
          provider({ providerId: "a", requestState: "SUCCEEDED", status: "OK" }),
          provider({ providerId: "b", requestState: "SUCCEEDED", status: "DEGRADED" }),
          provider({ providerId: "c", requestState: "NOT_REQUESTED", status: "IDLE" }),
        ],
      })
    );
    expect(advisories.filter((a) => a.id.includes(":provider:"))).toHaveLength(0);
  });
});

describe("deriveAdvisories — mode isolation via ids", () => {
  it("produces different ids for the identical condition in different modes", () => {
    const live = deriveAdvisories(baseInput({ mode: "LIVE_READ_ONLY", orbitRequest: "FAILED" }));
    const replay = deriveAdvisories(baseInput({ mode: "REPLAY", orbitRequest: "FAILED" }));
    const liveIds = new Set(live.map((a) => a.id));
    const replayIds = new Set(replay.map((a) => a.id));
    for (const id of liveIds) expect(replayIds.has(id)).toBe(false);
    expect(live.find((a) => a.id === "LIVE_READ_ONLY:orbit:fetch-failed")).toBeDefined();
    expect(replay.find((a) => a.id === "REPLAY:orbit:fetch-failed")).toBeDefined();
  });
});

describe("deriveAdvisories — sorting", () => {
  it("orders CRITICAL before WARN, ties broken by id (localeCompare en), stable across repeated calls", () => {
    const input = baseInput({
      orbit: orbit({ provenance: provenance({ freshness: "STALE" }) }), // WARN orbit:stale
      telemetry: telemetry({ status: "ERROR", error: "boom" }), // CRITICAL tlm:error
      health: [
        provider({ providerId: "x", requestState: "FAILED", status: "TOKEN_MISSING" }), // WARN
        provider({ providerId: "y", requestState: "FAILED", status: "ERROR", lastError: "down" }), // CRITICAL
      ],
    });
    const run1 = deriveAdvisories(input);
    const run2 = deriveAdvisories(input);
    expect(run1.map((a) => a.id)).toEqual(run2.map((a) => a.id));

    const severities = run1.map((a) => a.severity);
    const firstWarn = severities.indexOf("WARN");
    expect(severities.slice(0, firstWarn).every((s) => s === "CRITICAL")).toBe(true);

    const criticalIds = run1.filter((a) => a.severity === "CRITICAL").map((a) => a.id);
    const sortedCritical = [...criticalIds].sort((a, b) => a.localeCompare(b, "en"));
    expect(criticalIds).toEqual(sortedCritical);

    const warnIds = run1.filter((a) => a.severity === "WARN").map((a) => a.id);
    const sortedWarn = [...warnIds].sort((a, b) => a.localeCompare(b, "en"));
    expect(warnIds).toEqual(sortedWarn);
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

describe("MissionStore.getAdvisories / ackAdvisory (store-level ack semantics)", () => {
  it("getAdvisories() does not mutate the ack set — repeated calls are stable", async () => {
    const { MissionStore } = await import("../src/store/missionStore");
    const store = new MissionStore();
    const before = store.getAdvisories();
    const after = store.getAdvisories();
    expect(before.active.map((a) => a.id)).toEqual(after.active.map((a) => a.id));
    expect(before.acked).toHaveLength(0);
    expect(after.acked).toHaveLength(0);
  });

  it("ackAdvisory('nonexistent') adds nothing and logs nothing", async () => {
    const { MissionStore } = await import("../src/store/missionStore");
    const store = new MissionStore();
    const eventsBefore = store.events.length;
    store.ackAdvisory("nonexistent-advisory-id");
    expect(store.events.length).toBe(eventsBefore);
    const { active, acked } = store.getAdvisories();
    expect(acked).toHaveLength(0);
    expect(active.find((a) => a.id === "nonexistent-advisory-id")).toBeUndefined();
  });
});
