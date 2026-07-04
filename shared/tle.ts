/**
 * TLE / GP text normalizer. Used by both the BFF server (normalizing
 * CelesTrak responses) and the client (fixtures, tests).
 */

export interface ParsedTle {
  line1: string;
  line2: string;
  name: string | null;
  noradId: number;
  /** ISO-8601 UTC */
  epoch: string;
}

/** TLE line checksum: sum of digits, '-' counts as 1, mod 10. */
export function tleChecksum(line: string): number {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= "0" && ch <= "9") sum += ch.charCodeAt(0) - 48;
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

export function isValidTleLine(line: string, lineNo: 1 | 2): boolean {
  if (line.length < 69) return false;
  if (line[0] !== String(lineNo)) return false;
  if (line[1] !== " ") return false;
  return true;
}

/** Parse epoch field (cols 19-32 of line 1): YYDDD.DDDDDDDD */
export function tleEpochToDate(line1: string): Date {
  const yy = parseInt(line1.slice(18, 20), 10);
  const doy = parseFloat(line1.slice(20, 32));
  if (Number.isNaN(yy) || Number.isNaN(doy)) {
    throw new Error("TLE: invalid epoch field");
  }
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(year, 0, 1) + (doy - 1) * 86400_000;
  return new Date(Math.round(ms));
}

/**
 * Parse a TLE text blob (2-line or 3-line with a leading name line).
 * Throws on malformed input — callers must treat this as a provider error,
 * never silently substitute simulated data.
 */
export function parseTleText(text: string): ParsedTle {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const i1 = lines.findIndex((l) => l.startsWith("1 "));
  if (i1 < 0 || i1 + 1 >= lines.length) {
    throw new Error("TLE: could not find line 1 / line 2");
  }
  const line1 = lines[i1];
  const line2 = lines[i1 + 1];
  const name = i1 > 0 ? lines[i1 - 1].trim() : null;

  if (!isValidTleLine(line1, 1)) throw new Error("TLE: malformed line 1");
  if (!isValidTleLine(line2, 2)) throw new Error("TLE: malformed line 2");

  const cs1 = parseInt(line1[68], 10);
  const cs2 = parseInt(line2[68], 10);
  if (cs1 !== tleChecksum(line1)) throw new Error("TLE: line 1 checksum mismatch");
  if (cs2 !== tleChecksum(line2)) throw new Error("TLE: line 2 checksum mismatch");

  const norad1 = parseInt(line1.slice(2, 7), 10);
  const norad2 = parseInt(line2.slice(2, 7), 10);
  if (Number.isNaN(norad1) || norad1 !== norad2) {
    throw new Error("TLE: NORAD id mismatch between lines");
  }

  return {
    line1,
    line2,
    name,
    noradId: norad1,
    epoch: tleEpochToDate(line1).toISOString(),
  };
}
