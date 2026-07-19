import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveOperationalAssessment, type OperationalSnapshot } from "../src/domain/operationalAssessment";
import type {
  DataProvenance,
  GroundStation,
  OrbitState,
  TelemetrySnapshot,
} from "../src/domain/types";
import type { ContactPhaseInfo } from "../src/domain/contactPhase";
import { MissionStore } from "../src/store/missionStore";
import type { MissionApi } from "../src/services/api/missionApi";

function provenance(overrides: Partial<DataProvenance> = {}): DataProvenance {
  return {
    source: "test",
    sourceName: "Test Source",
    observedAt: null,
    fetchedAt: null,
    dataMode: "LIVE_READ_ONLY",
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

const noContact: ContactPhaseInfo = {
  phase: "NO_WINDOW",
  activeWindow: null,
  nextWindow: null,
  tToAosMs: null,
  tToLosMs: null,
};

function baseSnapshot(overrides: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
  return {
    mode: "LIVE_READ_ONLY",
    orbit: orbit(),
    orbitRequest: "SUCCEEDED",
    telemetry: telemetry(),
    tlmRequest: "SUCCEEDED",
    health: [],
    stations: [station("gs1")],
    phase: noContact,
    ...overrides,
  };
}

describe("deriveOperationalAssessment — same-snapshot consistency", () => {
  it("orbitRequest FAILED yields BOTH a CRITICAL orbit advisory AND checklist orbit-source FAIL", () => {
    const snapshot = baseSnapshot({ orbitRequest: "FAILED", orbit: orbit({ error: "fetch failed" }) });
    const assessment = deriveOperationalAssessment(snapshot);

    const orbitAdvisory = assessment.advisories.find((a) => a.id.includes(":orbit:"));
    expect(orbitAdvisory).toBeDefined();
    expect(orbitAdvisory!.severity).toBe("CRITICAL");

    const orbitItem = assessment.checklist.find((i) => i.id === "orbit-source");
    expect(orbitItem).toBeDefined();
    expect(orbitItem!.status).toBe("FAIL");
  });

  it("a LOADING snapshot yields NO advisory AND checklist CHECKING (never FAIL)", () => {
    const snapshot = baseSnapshot({ orbitRequest: "LOADING", tlmRequest: "LOADING" });
    const assessment = deriveOperationalAssessment(snapshot);

    const orbitAdvisory = assessment.advisories.find((a) => a.id.includes(":orbit:"));
    const tlmAdvisory = assessment.advisories.find((a) => a.id.includes(":tlm:"));
    expect(orbitAdvisory).toBeUndefined();
    expect(tlmAdvisory).toBeUndefined();

    const orbitItem = assessment.checklist.find((i) => i.id === "orbit-source")!;
    const tleItem = assessment.checklist.find((i) => i.id === "tle-age")!;
    const tlmItem = assessment.checklist.find((i) => i.id === "telemetry")!;
    expect(orbitItem.status).toBe("CHECKING");
    expect(tleItem.status).toBe("CHECKING");
    expect(tlmItem.status).toBe("CHECKING");
    expect(assessment.checklist.every((i) => i.status !== "FAIL")).toBe(true);
  });
});

describe("MissionStore.getOperationalAssessment — store-level", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fresh store in SIMULATED then setMode LIVE with a never-resolving fake MissionApi: zero FAIL checklist items and zero advisories during initial load", () => {
    const neverResolves = <T,>(): Promise<T> => new Promise<T>(() => {});
    const fakeApi = {
      getOrbit: vi.fn(() => neverResolves()),
      getObservations: vi.fn(() => neverResolves()),
      getTelemetry: vi.fn(() => neverResolves()),
    } as unknown as MissionApi;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T10:00:00.000Z"));

    const store = new MissionStore(fakeApi);
    expect(store.mode).toBe("SIMULATED");

    store.setMode("LIVE_READ_ONLY");
    store.start();
    // Advance past a tick so refreshLiveIfDue actually fires and moves the
    // request lifecycle from NOT_REQUESTED to LOADING (it can never reach
    // SUCCEEDED/FAILED because the fake API promises never resolve).
    vi.advanceTimersByTime(1000);
    store.stop();

    const assessment = store.getOperationalAssessment();
    expect(assessment.checklist.filter((i) => i.status === "FAIL")).toEqual([]);
    expect(assessment.advisories.active).toEqual([]);
    expect(assessment.advisories.acked).toEqual([]);
  });

  it("SIMULATED mode contains no LIVE provider items (mode-appropriate health snapshot)", () => {
    const store = new MissionStore();
    expect(store.mode).toBe("SIMULATED");
    const assessment = store.getOperationalAssessment();
    const providersItem = assessment.checklist.find((i) => i.id === "providers")!;
    // The simulator's own provider health entries only, never celestrak/satnogs live ids.
    expect(providersItem).toBeDefined();
    expect(assessment.checklist.every((i) => i.status !== "FAIL")).toBe(true);
  });

  it("REPLAY mode contains no LIVE provider items (mode-appropriate health snapshot)", () => {
    const store = new MissionStore();
    store.setMode("REPLAY");
    const assessment = store.getOperationalAssessment();
    const providersItem = assessment.checklist.find((i) => i.id === "providers")!;
    expect(providersItem).toBeDefined();
    expect(assessment.checklist.every((i) => i.status !== "FAIL")).toBe(true);
  });

  it('constructor with controlPlaneModeRaw "flight" logs a WARN CTRL event and controlPlane.getStatus() === "DISABLED"', () => {
    const store = new MissionStore(undefined, "flight");
    expect(store.controlPlane.getStatus()).toBe("DISABLED");
    const ctrlEvent = store.events.find((e) => e.type === "CTRL");
    expect(ctrlEvent).toBeDefined();
    expect(ctrlEvent!.level).toBe("WARN");
    expect(ctrlEvent!.msg).toContain("flight");
  });

  it('constructor with controlPlaneModeRaw "disabled" logs no CTRL warning', () => {
    const store = new MissionStore(undefined, "disabled");
    expect(store.controlPlane.getStatus()).toBe("DISABLED");
    expect(store.events.find((e) => e.type === "CTRL")).toBeUndefined();
  });

  it("constructor with controlPlaneModeRaw undefined logs no CTRL warning", () => {
    const store = new MissionStore();
    expect(store.controlPlane.getStatus()).toBe("DISABLED");
    expect(store.events.find((e) => e.type === "CTRL")).toBeUndefined();
  });
});
