/**
 * CRITICAL SAFETY TEST: rehearsal commands must NEVER perform any I/O.
 * This suite asserts that createRehearsal / createCommandRehearsal never
 * touch the network, and that the returned/logged data is unambiguously
 * labeled as not transmitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MissionStore } from "../src/store/missionStore";
import {
  createCommandRehearsal,
  rehearsalTransition,
  REHEARSAL_LOG_SUFFIX,
  REHEARSAL_ACK_DELAY_MS,
  REHEARSAL_RESULT_DELAY_MS,
  REHEARSAL_SIM_NOTE,
} from "../src/domain/commandRehearsal";

describe("MissionStore.createRehearsal (safety)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never touches the network and records a non-transmitted rehearsal", () => {
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");

    const rehearsal = store.createRehearsal("SAFE_MODE", null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rehearsal.transmitted).toBe(false);
    expect(rehearsal.note).toContain("COMMAND NOT TRANSMITTED");

    expect(store.rehearsals[0]).toBe(rehearsal);

    const rhrslEvent = store.events.find((e) => e.type === "RHRSL");
    expect(rhrslEvent).toBeTruthy();
    expect(rhrslEvent?.msg).toContain("COMMAND NOT TRANSMITTED");
  });

  it("never touches the network in REPLAY mode either", () => {
    const store = new MissionStore();
    store.setMode("REPLAY");
    store.createRehearsal("PING", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createCommandRehearsal (pure domain function)", () => {
  it("produces a rehearsal that is never transmitted, with the required log suffix", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { rehearsal, logMessage } = createCommandRehearsal(1, "SAFE_MODE", null, "LIVE_READ_ONLY", now);

    expect(rehearsal.transmitted).toBe(false);
    expect(rehearsal.id).toBe("RHR-001");
    expect(rehearsal.name).toBe("SAFE_MODE");
    expect(rehearsal.param).toBeNull();
    expect(rehearsal.mode).toBe("LIVE_READ_ONLY");
    expect(rehearsal.createdAt).toBe(now.toISOString());
    expect(rehearsal.note).toBe(REHEARSAL_LOG_SUFFIX);
    expect(rehearsal.status).toBe("CREATED");
    expect(rehearsal.failReason).toBeNull();
    expect(logMessage).toContain("READ-ONLY MODE: COMMAND NOT TRANSMITTED");
    expect(logMessage).toContain("RHR-001");
  });

  it("includes the param in the log message when provided", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { logMessage } = createCommandRehearsal(2, "RESET_ADCS", "Z", "REPLAY", now);
    expect(logMessage).toContain("[Z]");
    expect(logMessage).toContain(REHEARSAL_LOG_SUFFIX);
  });
});

describe("rehearsalTransition (pure domain function)", () => {
  it("stays CREATED just below the ACK delay", () => {
    expect(rehearsalTransition("CREATED", REHEARSAL_ACK_DELAY_MS - 1, 0, "RHR-001")).toBeNull();
  });

  it("transitions CREATED -> REHEARSAL_ACK exactly at the ACK delay", () => {
    const t = rehearsalTransition("CREATED", REHEARSAL_ACK_DELAY_MS, 0, "RHR-001");
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_ACK");
    expect(t!.failReason).toBeNull();
  });

  it("stays REHEARSAL_ACK just below the result delay", () => {
    expect(rehearsalTransition("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS - 1, 0, "RHR-001")).toBeNull();
  });

  it("transitions REHEARSAL_ACK -> REHEARSAL_EXEC at the result delay when roll === 0.15 (not < threshold)", () => {
    const t = rehearsalTransition("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS, 0.15, "RHR-001");
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_EXEC");
    expect(t!.failReason).toBeNull();
  });

  it("transitions REHEARSAL_ACK -> REHEARSAL_FAIL at the result delay when roll === 0.1499 (< threshold), with a failReason", () => {
    const t = rehearsalTransition("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS, 0.1499, "RHR-001");
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_FAIL");
    expect(t!.failReason).toBeTruthy();
  });

  it("returns null for terminal states regardless of elapsed time", () => {
    expect(rehearsalTransition("REHEARSAL_EXEC", 1_000_000, 0, "RHR-001")).toBeNull();
    expect(rehearsalTransition("REHEARSAL_FAIL", 1_000_000, 0, "RHR-001")).toBeNull();
  });

  it("logMessage contains REHEARSAL_SIM_NOTE and the rehearsal id", () => {
    const t = rehearsalTransition("CREATED", REHEARSAL_ACK_DELAY_MS, 0, "RHR-042");
    expect(t!.logMessage).toContain(REHEARSAL_SIM_NOTE);
    expect(t!.logMessage).toContain("RHR-042");
  });
});

describe("MissionStore rehearsal lifecycle — full network-silence guarantee", () => {
  it("drives CREATED -> ACK -> terminal purely from wall-clock ticks, with zero network I/O at any point", () => {
    const fetchMock = vi.fn();
    const xhrMock = vi.fn();
    const wsMock = vi.fn();
    const sendBeaconMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", xhrMock);
    vi.stubGlobal("WebSocket", wsMock);
    vi.stubGlobal("navigator", { sendBeacon: sendBeaconMock });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

    const store = new MissionStore();
    // REPLAY mode, not LIVE — LIVE's tick() would trigger real provider
    // refresh fetches, which would confound the network-silence assertion.
    store.setMode("REPLAY");
    store.start();

    const rehearsal = store.createRehearsal("SAFE_MODE", null);

    // Advance past both the ACK delay and the result delay (measured from
    // createdAt), so tick() drives the full lifecycle.
    vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS + 1000);

    store.stop();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrMock).not.toHaveBeenCalled();
    expect(wsMock).not.toHaveBeenCalled();
    expect(sendBeaconMock).not.toHaveBeenCalled();

    expect(store.rehearsals.every((r) => r.transmitted === false)).toBe(true);

    const updated = store.rehearsals.find((r) => r.id === rehearsal.id);
    expect(updated).toBeDefined();
    expect(["REHEARSAL_EXEC", "REHEARSAL_FAIL"]).toContain(updated!.status);

    const rhrslEvents = store.events.filter((e) => e.type === "RHRSL");
    expect(rhrslEvents.length).toBeGreaterThan(0);
    expect(rhrslEvents.every((e) => e.msg.includes("NOT TRANSMITTED"))).toBe(true);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
