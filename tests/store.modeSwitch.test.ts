import { describe, it, expect, vi, afterEach } from "vitest";
import { MissionStore } from "../src/store/missionStore";

describe("MissionStore mode switching — no silent fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs a MODE event when switching to LIVE_READ_ONLY", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network disabled in test")))
    );
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");
    const modeEvent = store.events.find((e) => e.type === "MODE" && e.msg.includes("mode switched to LIVE_READ_ONLY"));
    expect(modeEvent).toBeTruthy();
  });

  it("stays in LIVE_READ_ONLY and reports UNAVAILABLE when the live refresh fails (no silent fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network disabled in test")))
    );
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");

    await store.liveOrbit.refresh(new Date());

    expect(store.mode).toBe("LIVE_READ_ONLY");
    const orbitState = store.getOrbitState();
    expect(orbitState.position).toBeNull();
    expect(orbitState.provenance.freshness).toBe("UNAVAILABLE");

    const health = store.getProviderHealth();
    const celestrakHealth = health.find((h) => h.providerId === "celestrak-orbit");
    expect(celestrakHealth?.status).toBe("ERROR");
  });

  it("switches to SIMULATED and reports isSimulated true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network disabled in test")))
    );
    const store = new MissionStore();
    store.setMode("LIVE_READ_ONLY");
    await store.liveOrbit.refresh(new Date());

    store.setMode("SIMULATED");
    expect(store.mode).toBe("SIMULATED");
    expect(store.getOrbitState().provenance.isSimulated).toBe(true);
  });
});
