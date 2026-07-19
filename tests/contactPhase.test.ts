import { describe, it, expect } from "vitest";
import { contactPhaseAt, PREP_THRESHOLD_S } from "../src/domain/contactPhase";
import type { NetWindow } from "../src/domain/netWindow";

describe("contactPhaseAt", () => {
  it("returns CONTACT when now is inside a window, with tToLosMs set", () => {
    const windows: NetWindow[] = [{ startMs: 0, endMs: 1000, stationIds: ["a"] }];
    const info = contactPhaseAt(500, windows);
    expect(info.phase).toBe("CONTACT");
    expect(info.activeWindow).toEqual(windows[0]);
    expect(info.tToLosMs).toBe(500);
    expect(info.tToAosMs).toBeNull();
  });

  it("boundary: now === startMs is CONTACT", () => {
    const windows: NetWindow[] = [{ startMs: 1000, endMs: 2000, stationIds: ["a"] }];
    const info = contactPhaseAt(1000, windows);
    expect(info.phase).toBe("CONTACT");
  });

  it("boundary: now === endMs is NOT CONTACT (window is half-open)", () => {
    const windows: NetWindow[] = [{ startMs: 1000, endMs: 2000, stationIds: ["a"] }];
    const info = contactPhaseAt(2000, windows);
    expect(info.phase).not.toBe("CONTACT");
  });

  it("returns PREP when the next window starts within PREP_THRESHOLD_S", () => {
    const windows: NetWindow[] = [{ startMs: 100_000, endMs: 200_000, stationIds: ["a"] }];
    const nowMs = 100_000 - PREP_THRESHOLD_S * 1000; // exactly PREP_THRESHOLD_S before start
    const info = contactPhaseAt(nowMs, windows);
    expect(info.phase).toBe("PREP");
    expect(info.tToAosMs).toBe(PREP_THRESHOLD_S * 1000);
    expect(info.tToLosMs).toBeNull();
    expect(info.nextWindow).toEqual(windows[0]);
  });

  it("boundary: exactly PREP_THRESHOLD_S before start is PREP, one ms more is IDLE", () => {
    const windows: NetWindow[] = [{ startMs: 1_000_000, endMs: 1_100_000, stationIds: ["a"] }];
    const atThreshold = contactPhaseAt(1_000_000 - PREP_THRESHOLD_S * 1000, windows);
    expect(atThreshold.phase).toBe("PREP");
    const justOver = contactPhaseAt(1_000_000 - PREP_THRESHOLD_S * 1000 - 1, windows);
    expect(justOver.phase).toBe("IDLE");
  });

  it("returns IDLE when the next window is further out than PREP_THRESHOLD_S", () => {
    const windows: NetWindow[] = [{ startMs: 10_000_000, endMs: 10_100_000, stationIds: ["a"] }];
    const info = contactPhaseAt(0, windows);
    expect(info.phase).toBe("IDLE");
    expect(info.tToAosMs).toBe(10_000_000);
  });

  it("returns NO_WINDOW when there are no windows at all", () => {
    const info = contactPhaseAt(0, []);
    expect(info.phase).toBe("NO_WINDOW");
    expect(info.activeWindow).toBeNull();
    expect(info.nextWindow).toBeNull();
    expect(info.tToAosMs).toBeNull();
    expect(info.tToLosMs).toBeNull();
  });

  it("returns NO_WINDOW when all windows are entirely in the past", () => {
    const windows: NetWindow[] = [{ startMs: 0, endMs: 1000, stationIds: ["a"] }];
    const info = contactPhaseAt(5000, windows);
    expect(info.phase).toBe("NO_WINDOW");
  });

  it("picks the correct next window among several future windows", () => {
    const windows: NetWindow[] = [
      { startMs: 5000, endMs: 6000, stationIds: ["a"] },
      { startMs: 20_000, endMs: 21_000, stationIds: ["b"] },
    ];
    const info = contactPhaseAt(0, windows);
    expect(info.nextWindow).toEqual(windows[0]);
  });
});
