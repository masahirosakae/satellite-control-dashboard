import { describe, it, expect } from "vitest";
import { mergeNetWindows, type PassInterval } from "../src/domain/netWindow";

const H = 3600_000;

describe("mergeNetWindows", () => {
  it("merges overlapping intervals from different stations into one window", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 0, losMs: 10 * 60_000 },
      { stationId: "b", aosMs: 5 * 60_000, losMs: 15 * 60_000 },
    ];
    const out = mergeNetWindows(passes);
    expect(out).toHaveLength(1);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(15 * 60_000);
    expect(out[0].stationIds).toEqual(["a", "b"]);
  });

  it("merges adjacent passes where los === next aos at zero tolerance", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 0, losMs: 100_000 },
      { stationId: "b", aosMs: 100_000, losMs: 200_000 },
    ];
    const out = mergeNetWindows(passes, 0);
    expect(out).toHaveLength(1);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(200_000);
  });

  it("does not merge a gap larger than the tolerance", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 0, losMs: 100_000 },
      { stationId: "b", aosMs: 200_000, losMs: 300_000 },
    ];
    const out = mergeNetWindows(passes, 60); // 60s tolerance, gap is 100s
    expect(out).toHaveLength(2);
  });

  it("merges a gap that is within the tolerance", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 0, losMs: 100_000 },
      { stationId: "b", aosMs: 150_000, losMs: 300_000 }, // gap = 50s
    ];
    const out = mergeNetWindows(passes, 60);
    expect(out).toHaveLength(1);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(300_000);
  });

  it("merges 3 simultaneous stations into one window with 3 deduped stationIds", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 0, losMs: 10 * 60_000 },
      { stationId: "b", aosMs: 1 * 60_000, losMs: 9 * 60_000 },
      { stationId: "c", aosMs: 2 * 60_000, losMs: 11 * 60_000 },
    ];
    const out = mergeNetWindows(passes);
    expect(out).toHaveLength(1);
    expect(out[0].stationIds).toEqual(["a", "b", "c"]);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(11 * 60_000);
  });

  it("handles full containment (a shorter pass entirely inside a longer one)", () => {
    const passes: PassInterval[] = [
      { stationId: "outer", aosMs: 0, losMs: 20 * 60_000 },
      { stationId: "inner", aosMs: 5 * 60_000, losMs: 10 * 60_000 },
    ];
    const out = mergeNetWindows(passes);
    expect(out).toHaveLength(1);
    expect(out[0].startMs).toBe(0);
    expect(out[0].endMs).toBe(20 * 60_000);
    expect(out[0].stationIds).toEqual(["outer", "inner"]);
  });

  it("returns an empty array for empty input", () => {
    expect(mergeNetWindows([])).toEqual([]);
  });

  it("ignores inverted/zero-duration passes (losMs <= aosMs)", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 100, losMs: 50 },
      { stationId: "b", aosMs: 100, losMs: 100 },
      { stationId: "c", aosMs: 0, losMs: H },
    ];
    const out = mergeNetWindows(passes);
    expect(out).toHaveLength(1);
    expect(out[0].stationIds).toEqual(["c"]);
  });

  it("produces sorted, disjoint output", () => {
    const passes: PassInterval[] = [
      { stationId: "a", aosMs: 5 * H, losMs: 6 * H },
      { stationId: "b", aosMs: 0, losMs: H },
      { stationId: "c", aosMs: 2 * H, losMs: 3 * H },
    ];
    const out = mergeNetWindows(passes);
    expect(out).toHaveLength(3);
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i].endMs).toBeLessThanOrEqual(out[i + 1].startMs);
      expect(out[i].startMs).toBeLessThan(out[i + 1].startMs);
    }
  });
});
