import { describe, it, expect } from "vitest";
import { parseTleText, tleChecksum, tleEpochToDate } from "../shared/tle";
import fixture from "../src/fixtures/sonate2-replay.json";

const { line1, line2, name } = fixture.tle;

describe("parseTleText", () => {
  it("parses 3-line text (name + line1 + line2)", () => {
    const text = `${name}\n${line1}\n${line2}`;
    const parsed = parseTleText(text);
    expect(parsed.noradId).toBe(59112);
    expect(parsed.name).toBe(name);
    expect(parsed.line1).toBe(line1);
    expect(parsed.line2).toBe(line2);
    expect(parsed.epoch).toBe("2026-06-15T12:00:00.000Z");
  });

  it("parses 2-line text (no name line)", () => {
    const text = `${line1}\n${line2}`;
    const parsed = parseTleText(text);
    expect(parsed.noradId).toBe(59112);
    expect(parsed.name).toBeNull();
    expect(parsed.epoch).toBe("2026-06-15T12:00:00.000Z");
  });

  it("rejects empty string", () => {
    expect(() => parseTleText("")).toThrow();
  });

  it("rejects swapped lines (line2 before line1)", () => {
    const text = `${line2}\n${line1}`;
    expect(() => parseTleText(text)).toThrow();
  });

  it("rejects a corrupted checksum digit", () => {
    const goodChecksum = line1[68];
    const badDigit = String((parseInt(goodChecksum, 10) + 1) % 10);
    const corruptedLine1 = line1.slice(0, 68) + badDigit;
    const text = `${corruptedLine1}\n${line2}`;
    expect(() => parseTleText(text)).toThrow(/checksum/i);
  });

  it("rejects a line with wrong length", () => {
    const truncatedLine1 = line1.slice(0, 50);
    const text = `${truncatedLine1}\n${line2}`;
    expect(() => parseTleText(text)).toThrow(/malformed/i);
  });
});

describe("tleChecksum", () => {
  it("matches the checksum digit embedded in the fixture lines", () => {
    expect(tleChecksum(line1)).toBe(parseInt(line1[68], 10));
    expect(tleChecksum(line2)).toBe(parseInt(line2[68], 10));
  });
});

describe("tleEpochToDate", () => {
  it("computes the fixture epoch from line 1", () => {
    const d = tleEpochToDate(line1);
    expect(d.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });
});
