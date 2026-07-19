/**
 * CRITICAL SAFETY TEST: rehearsal commands must NEVER perform any I/O.
 * This suite asserts that createRehearsal / createCommandRehearsal never
 * touch the network, and that the returned/logged data is unambiguously
 * labeled as not transmitted. It also covers the LIVE/REPLAY context
 * separation introduced in this fix (createdInMode, createdAtWallClock,
 * contextTimestamp, per-mode histories).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MissionStore } from "../src/store/missionStore";
import type { MissionApi } from "../src/services/api/missionApi";
import {
  createCommandRehearsal,
  advanceRehearsal,
  assertNotTransmitted,
  REHEARSAL_LOG_SUFFIX,
  REHEARSAL_ACK_DELAY_MS,
  REHEARSAL_RESULT_DELAY_MS,
  REHEARSAL_SIM_NOTE,
} from "../src/domain/commandRehearsal";
import type { CommandRehearsal } from "../src/domain/types";

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
    expect(rehearsal).not.toBeNull();
    expect(rehearsal!.transmitted).toBe(false);
    expect(rehearsal!.note).toContain("COMMAND NOT TRANSMITTED");

    expect(store.getRehearsals()[0]).toEqual(rehearsal);

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

  it("SIMULATED mode: createRehearsal returns null, records no history entry, logs a WARN, touches no network", () => {
    const store = new MissionStore();
    expect(store.mode).toBe("SIMULATED");

    const result = store.createRehearsal("SAFE_MODE", null);

    expect(result).toBeNull();
    expect(store.getRehearsals()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();

    const warnEvent = store.events.find((e) => e.type === "RHRSL" && e.level === "WARN");
    expect(warnEvent).toBeTruthy();
    expect(warnEvent?.msg.toLowerCase()).toContain("simulated");
  });
});

describe("MissionStore rehearsal history — per-mode separation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps LIVE-created and REPLAY-created rehearsals in separate histories", () => {
    const store = new MissionStore();

    store.setMode("LIVE_READ_ONLY");
    const liveR = store.createRehearsal("PING", null);
    expect(store.getRehearsals().map((r) => r.id)).toEqual([liveR!.id]);

    store.setMode("REPLAY");
    expect(store.getRehearsals()).toHaveLength(0); // REPLAY history starts empty
    const replayR = store.createRehearsal("SAFE_MODE", null);
    expect(store.getRehearsals().map((r) => r.id)).toEqual([replayR!.id]);

    store.setMode("LIVE_READ_ONLY");
    expect(store.getRehearsals().map((r) => r.id)).toEqual([liveR!.id]); // unaffected by REPLAY creation

    store.setMode("SIMULATED");
    expect(store.getRehearsals()).toHaveLength(0); // SIMULATED never shows rehearsal rows
  });
});

describe("MissionStore rehearsal fields — createdInMode / createdAtWallClock / contextTimestamp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sets all three fields; in LIVE contextTimestamp === display clock (wall clock) at creation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T10:00:00.000Z"));

    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");
    const r = store.createRehearsal("PING", null)!;

    expect(r.createdInMode).toBe("LIVE_READ_ONLY");
    expect(r.createdAtWallClock).toBe("2026-07-19T10:00:00.000Z");
    expect(r.contextTimestamp).toBe("2026-07-19T10:00:00.000Z");
  });

  it("in REPLAY, contextTimestamp === the replay cursor time at creation (may differ from wall clock)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T10:00:00.000Z"));

    const store = new MissionStore();
    store.setMode("REPLAY");
    const expectedContext = new Date(store.replayMs).toISOString();
    const r = store.createRehearsal("PING", null)!;

    expect(r.createdInMode).toBe("REPLAY");
    expect(r.createdAtWallClock).toBe("2026-07-19T10:00:00.000Z");
    expect(r.contextTimestamp).toBe(expectedContext);
    expect(r.contextTimestamp).not.toBe(r.createdAtWallClock);
  });

  it("RHRSL creation log contains both the mode and the context timestamp", () => {
    const store = new MissionStore();
    store.setMode("REPLAY");
    const r = store.createRehearsal("PING", null)!;
    const rhrslEvent = store.events.find((e) => e.type === "RHRSL" && e.msg.includes(r.id));
    expect(rhrslEvent).toBeTruthy();
    expect(rhrslEvent!.msg).toContain("REPLAY");
    expect(rhrslEvent!.msg).toContain(r.contextTimestamp);
  });
});

describe("createCommandRehearsal (pure domain function)", () => {
  it("produces a frozen rehearsal that is never transmitted, with the required log suffix", () => {
    const wallNow = new Date("2026-06-15T12:00:00.000Z");
    const contextNow = new Date("2026-06-15T11:00:00.000Z");
    const { rehearsal, logMessage } = createCommandRehearsal(1, "SAFE_MODE", null, "LIVE_READ_ONLY", wallNow, contextNow);

    expect(rehearsal.transmitted).toBe(false);
    expect(rehearsal.id).toBe("RHR-001");
    expect(rehearsal.name).toBe("SAFE_MODE");
    expect(rehearsal.param).toBeNull();
    expect(rehearsal.createdInMode).toBe("LIVE_READ_ONLY");
    expect(rehearsal.createdAtWallClock).toBe(wallNow.toISOString());
    expect(rehearsal.contextTimestamp).toBe(contextNow.toISOString());
    expect(rehearsal.note).toBe(REHEARSAL_LOG_SUFFIX);
    expect(rehearsal.status).toBe("CREATED");
    expect(rehearsal.failReason).toBeNull();
    expect(logMessage).toContain("READ-ONLY MODE: COMMAND NOT TRANSMITTED");
    expect(logMessage).toContain("RHR-001");
    expect(logMessage).toContain("LIVE_READ_ONLY");
    expect(logMessage).toContain(contextNow.toISOString());
    expect(Object.isFrozen(rehearsal)).toBe(true);
  });

  it("includes the param in the log message when provided", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { logMessage } = createCommandRehearsal(2, "RESET_ADCS", "Z", "REPLAY", now, now);
    expect(logMessage).toContain("[Z]");
    expect(logMessage).toContain(REHEARSAL_LOG_SUFFIX);
  });
});

describe("assertNotTransmitted", () => {
  it("does not throw for a well-formed rehearsal", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { rehearsal } = createCommandRehearsal(1, "PING", null, "LIVE_READ_ONLY", now, now);
    expect(() => assertNotTransmitted(rehearsal)).not.toThrow();
  });

  it("throws on a tampered object claiming transmitted !== false", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { rehearsal } = createCommandRehearsal(1, "PING", null, "LIVE_READ_ONLY", now, now);
    const tampered = { ...rehearsal, transmitted: true } as unknown as CommandRehearsal;
    expect(() => assertNotTransmitted(tampered)).toThrow();
  });
});

describe("advanceRehearsal (pure domain function)", () => {
  const ctx = "2026-06-15T12:00:00.000Z";

  it("stays CREATED just below the ACK delay", () => {
    expect(advanceRehearsal("CREATED", REHEARSAL_ACK_DELAY_MS - 1, 0, "RHR-001", "LIVE_READ_ONLY", ctx)).toBeNull();
  });

  it("transitions CREATED -> REHEARSAL_ACK exactly at the ACK delay (2000)", () => {
    const t = advanceRehearsal("CREATED", 2000, 0, "RHR-001", "LIVE_READ_ONLY", ctx);
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_ACK");
    expect(t!.failReason).toBeNull();
    expect(t!.logMessages).toHaveLength(1);
  });

  it("stays REHEARSAL_ACK just below the result delay (1999 from CREATED — still under 2000 boundary case covered above; use ACK state directly)", () => {
    expect(advanceRehearsal("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS - 1, 0, "RHR-001", "LIVE_READ_ONLY", ctx)).toBeNull();
  });

  it("CREATED with elapsed >= 5000 jumps straight to terminal in ONE call, emitting BOTH log messages (ACK then EXEC/FAIL)", () => {
    const t = advanceRehearsal("CREATED", REHEARSAL_RESULT_DELAY_MS, 0.9, "RHR-001", "LIVE_READ_ONLY", ctx);
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_EXEC");
    expect(t!.logMessages).toHaveLength(2);
    expect(t!.logMessages[0]).toContain("REHEARSAL_ACK");
    expect(t!.logMessages[1]).toContain("REHEARSAL_EXEC");
  });

  it("(ACK, 5000, roll=0.15) -> REHEARSAL_EXEC (not < threshold)", () => {
    const t = advanceRehearsal("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS, 0.15, "RHR-001", "LIVE_READ_ONLY", ctx);
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_EXEC");
    expect(t!.failReason).toBeNull();
    expect(t!.logMessages).toHaveLength(1);
  });

  it("(ACK, 5000, roll=0.1499) -> REHEARSAL_FAIL (< threshold), with a failReason", () => {
    const t = advanceRehearsal("REHEARSAL_ACK", REHEARSAL_RESULT_DELAY_MS, 0.1499, "RHR-001", "LIVE_READ_ONLY", ctx);
    expect(t).not.toBeNull();
    expect(t!.status).toBe("REHEARSAL_FAIL");
    expect(t!.failReason).toBe("training scenario fault injection — not a real spacecraft fault");
  });

  it("returns null for terminal states regardless of elapsed time (no double transitions)", () => {
    expect(advanceRehearsal("REHEARSAL_EXEC", 1_000_000, 0, "RHR-001", "LIVE_READ_ONLY", ctx)).toBeNull();
    expect(advanceRehearsal("REHEARSAL_FAIL", 1_000_000, 0, "RHR-001", "LIVE_READ_ONLY", ctx)).toBeNull();
  });

  it("logMessages contain REHEARSAL_SIM_NOTE, the rehearsal id, mode, and ctx timestamp", () => {
    const t = advanceRehearsal("CREATED", REHEARSAL_ACK_DELAY_MS, 0, "RHR-042", "REPLAY", ctx);
    expect(t!.logMessages[0]).toContain(REHEARSAL_SIM_NOTE);
    expect(t!.logMessages[0]).toContain("RHR-042");
    expect(t!.logMessages[0]).toContain("REPLAY");
    expect(t!.logMessages[0]).toContain(ctx);
  });
});

describe("MissionStore rehearsal roll — fixed once per id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not change status on ticks after reaching a terminal state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const store = new MissionStore();
    store.setMode("REPLAY");
    store.start();
    const r = store.createRehearsal("PING", null)!;

    vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS + 1000);
    const afterTerminal = store.getRehearsals().find((x) => x.id === r.id)!;
    expect(["REHEARSAL_EXEC", "REHEARSAL_FAIL"]).toContain(afterTerminal.status);

    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    const stillSame = store.getRehearsals().find((x) => x.id === r.id)!;
    expect(stillSame.status).toBe(afterTerminal.status);
    expect(stillSame.failReason).toBe(afterTerminal.failReason);

    store.stop();
  });

  it("rehearsalRolls holds exactly one entry per rehearsal id", () => {
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");
    store.createRehearsal("PING", null);
    store.createRehearsal("PING", null);
    store.createRehearsal("PING", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rolls: Map<string, number> = (store as any).rehearsalRolls;
    expect(rolls.size).toBe(3);
  });
});

describe("MissionStore tickRehearsals — per-message log level", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("logs the intermediate ACK message at INFO even when a single tick jumps CREATED straight to a terminal REHEARSAL_FAIL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const store = new MissionStore();
    store.setMode("REPLAY");
    const r = store.createRehearsal("PING", null)!;

    // Force a FAIL outcome by seeding the pre-drawn roll below the 0.15
    // threshold, then jump straight past both delays (>= 5000ms) in one
    // tick so advanceRehearsal returns both the ACK and the terminal
    // REHEARSAL_FAIL log message from a single call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rolls: Map<string, number> = (store as any).rehearsalRolls;
    rolls.set(r.id, 0.1);

    store.start();
    vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS + 1000);
    store.stop();

    const updated = store.getRehearsals().find((x) => x.id === r.id)!;
    expect(updated.status).toBe("REHEARSAL_FAIL");

    const rhrslEvents = store.events.filter((e) => e.type === "RHRSL" && e.msg.includes(r.id));
    // creation log + ACK log + terminal log = 3 RHRSL entries for this id.
    const ackEvent = rhrslEvents.find((e) => e.msg.includes("REHEARSAL_ACK"));
    const failEvent = rhrslEvents.find((e) => e.msg.includes("REHEARSAL_FAIL"));
    expect(ackEvent).toBeTruthy();
    expect(failEvent).toBeTruthy();
    expect(ackEvent!.level).toBe("INFO");
    expect(failEvent!.level).toBe("WARN");
  });
});

describe("MissionStore rehearsal trim at 50", () => {
  it("trims history to 50 and removes the dropped entry's roll", () => {
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");
    const ids: string[] = [];
    for (let i = 0; i < 51; i++) {
      const r = store.createRehearsal("PING", null)!;
      ids.push(r.id);
    }
    expect(store.getRehearsals()).toHaveLength(50);
    const droppedId = ids[0]; // oldest, pushed out by unshift+pop
    expect(store.getRehearsals().find((r) => r.id === droppedId)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rolls: Map<string, number> = (store as any).rehearsalRolls;
    expect(rolls.has(droppedId)).toBe(false);
  });
});

describe("CommandRehearsal.transmitted invariant across the lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("transmitted === false in every state along the lifecycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const store = new MissionStore();
    store.setMode("REPLAY");
    store.start();
    const r = store.createRehearsal("PING", null)!;
    expect(r.transmitted).toBe(false);

    vi.advanceTimersByTime(REHEARSAL_ACK_DELAY_MS);
    expect(store.getRehearsals().find((x) => x.id === r.id)!.transmitted).toBe(false);

    vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS);
    expect(store.getRehearsals().find((x) => x.id === r.id)!.transmitted).toBe(false);

    store.stop();
    vi.useRealTimers();
  });
});

describe("MissionStore.stop() halts rehearsal progression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("advancing timers after stop() does not advance rehearsal status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const store = new MissionStore();
    store.setMode("REPLAY");
    store.start();
    const r = store.createRehearsal("PING", null)!;

    vi.advanceTimersByTime(REHEARSAL_ACK_DELAY_MS);
    const beforeStop = store.getRehearsals().find((x) => x.id === r.id)!;
    expect(beforeStop.status).toBe("REHEARSAL_ACK");

    store.stop();
    vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS + 10_000);
    const afterStop = store.getRehearsals().find((x) => x.id === r.id)!;
    expect(afterStop.status).toBe("REHEARSAL_ACK"); // unchanged — timer-driven only

    vi.useRealTimers();
  });
});

describe("MissionStore rehearsal lifecycle — full network-silence guarantee", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(["LIVE_READ_ONLY", "REPLAY"] as const)(
    "drives CREATED -> ACK -> terminal purely from wall-clock ticks, with zero network I/O at any point (mode=%s)",
    async (mode) => {
      const fetchMock = vi.fn();
      const xhrMock = vi.fn();
      const wsMock = vi.fn();
      const sendBeaconMock = vi.fn();
      const eventSourceMock = vi.fn();
      const webTransportMock = vi.fn();

      vi.stubGlobal("fetch", fetchMock);
      vi.stubGlobal("XMLHttpRequest", xhrMock);
      vi.stubGlobal("WebSocket", wsMock);
      vi.stubGlobal("navigator", { sendBeacon: sendBeaconMock });
      vi.stubGlobal("EventSource", eventSourceMock);
      if (typeof (globalThis as unknown as { WebTransport?: unknown }).WebTransport === "undefined") {
        vi.stubGlobal("WebTransport", webTransportMock);
      }

      // Fake MissionApi: LIVE tick() calls this via the live providers, but
      // the rehearsal code path must never touch it regardless of mode.
      const getOrbitMock = vi.fn(() => neverResolvesApi());
      const getObservationsMock = vi.fn(() => neverResolvesApi());
      const getTelemetryMock = vi.fn(() => neverResolvesApi());
      function neverResolvesApi<T>(): Promise<T> {
        return new Promise<T>(() => {});
      }
      const fakeApi = {
        getOrbit: getOrbitMock,
        getObservations: getObservationsMock,
        getTelemetry: getTelemetryMock,
      } as unknown as MissionApi;

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

      const store = new MissionStore(fakeApi);
      store.setMode(mode);
      store.start();

      const rehearsal = store.createRehearsal("SAFE_MODE", null)!;

      vi.advanceTimersByTime(REHEARSAL_RESULT_DELAY_MS + 1000);

      store.stop();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(xhrMock).not.toHaveBeenCalled();
      expect(wsMock).not.toHaveBeenCalled();
      expect(sendBeaconMock).not.toHaveBeenCalled();
      expect(eventSourceMock).not.toHaveBeenCalled();
      expect(webTransportMock).not.toHaveBeenCalled();

      expect(store.getRehearsals().every((r) => r.transmitted === false)).toBe(true);

      const updated = store.getRehearsals().find((r) => r.id === rehearsal.id);
      expect(updated).toBeDefined();
      expect(["REHEARSAL_EXEC", "REHEARSAL_FAIL"]).toContain(updated!.status);

      const rhrslEvents = store.events.filter((e) => e.type === "RHRSL");
      expect(rhrslEvents.length).toBeGreaterThan(0);
      expect(rhrslEvents.every((e) => e.msg.includes("NOT TRANSMITTED"))).toBe(true);

      if (mode === "REPLAY") {
        // In REPLAY the live providers are never touched at all.
        expect(getOrbitMock).not.toHaveBeenCalled();
        expect(getObservationsMock).not.toHaveBeenCalled();
        expect(getTelemetryMock).not.toHaveBeenCalled();
      }
      // In LIVE mode the fake api's call count may be > 0 purely from the
      // ordinary data-refresh path — that is unrelated to, and does not
      // correlate with, rehearsal creation/progression.
    }
  );
});
