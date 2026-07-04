/**
 * CRITICAL SAFETY TEST: rehearsal commands must NEVER perform any I/O.
 * This suite asserts that createRehearsal / createCommandRehearsal never
 * touch the network, and that the returned/logged data is unambiguously
 * labeled as not transmitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MissionStore } from "../src/store/missionStore";
import { createCommandRehearsal, REHEARSAL_LOG_SUFFIX } from "../src/domain/commandRehearsal";

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
