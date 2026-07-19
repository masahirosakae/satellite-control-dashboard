import { describe, it, expect } from "vitest";
import { filterEvents, normalizeTypeFilter, type DisplayLogEntry } from "../src/components/logs/eventLogFilter";

function entry(overrides: Partial<DisplayLogEntry> = {}): DisplayLogEntry {
  return {
    id: "ev-1",
    time: "00:00:00",
    level: "INFO",
    type: "SYS",
    msg: "hello",
    ...overrides,
  };
}

describe("filterEvents", () => {
  it("returns empty for empty input", () => {
    expect(filterEvents([], new Set(["INFO", "WARN", "ERROR"]), "ALL")).toEqual([]);
  });

  it("returns empty when all levels are disabled, even with entries present", () => {
    const entries = [entry({ level: "INFO" }), entry({ id: "ev-2", level: "WARN" })];
    expect(filterEvents(entries, new Set(), "ALL")).toEqual([]);
  });

  it("filters by enabled levels", () => {
    const entries = [
      entry({ id: "ev-1", level: "INFO" }),
      entry({ id: "ev-2", level: "WARN" }),
      entry({ id: "ev-3", level: "ERROR" }),
    ];
    const result = filterEvents(entries, new Set(["WARN"]), "ALL");
    expect(result.map((e) => e.id)).toEqual(["ev-2"]);
  });

  it("filters by type when typeFilter is not ALL", () => {
    const entries = [
      entry({ id: "ev-1", type: "SYS" }),
      entry({ id: "ev-2", type: "ORBIT" }),
      entry({ id: "ev-3", type: "ORBIT" }),
    ];
    const result = filterEvents(entries, new Set(["INFO", "WARN", "ERROR"]), "ORBIT");
    expect(result.map((e) => e.id)).toEqual(["ev-2", "ev-3"]);
  });

  it("returns all matching entries (non-empty) when entries exist and match", () => {
    const entries = [entry({ id: "ev-1" })];
    expect(filterEvents(entries, new Set(["INFO", "WARN", "ERROR"]), "ALL")).toHaveLength(1);
  });

  it("returns empty when entries exist but none match the type filter (distinct from empty-input case)", () => {
    const entries = [entry({ id: "ev-1", type: "SYS" })];
    const result = filterEvents(entries, new Set(["INFO", "WARN", "ERROR"]), "ORBIT");
    expect(result).toEqual([]);
    // distinguishable from the empty-input case only by the caller also
    // checking entries.length, which the component does.
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("normalizeTypeFilter", () => {
  it("keeps ALL as ALL", () => {
    expect(normalizeTypeFilter("ALL", ["SYS", "ORBIT"])).toBe("ALL");
  });

  it("keeps a still-valid selection", () => {
    expect(normalizeTypeFilter("ORBIT", ["SYS", "ORBIT"])).toBe("ORBIT");
  });

  it("resets to ALL when the selected type no longer exists", () => {
    expect(normalizeTypeFilter("ORBIT", ["SYS", "TLM"])).toBe("ALL");
  });

  it("resets to ALL when availableTypes is empty", () => {
    expect(normalizeTypeFilter("ORBIT", [])).toBe("ALL");
  });
});
