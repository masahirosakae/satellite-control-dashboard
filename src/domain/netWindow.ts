/**
 * Merge per-station pass intervals into "net windows" — contiguous spans
 * during which at least one ground station has the spacecraft in view.
 * Pure, no I/O.
 */

export interface NetWindow {
  startMs: number;
  endMs: number;
  /** Deduped station ids that contributed to this window, in first-contribution order. */
  stationIds: string[];
}

export interface PassInterval {
  stationId: string;
  aosMs: number;
  losMs: number;
}

/**
 * Merge overlapping/adjacent pass intervals into disjoint, time-sorted
 * NetWindows. Two intervals merge when they overlap or the gap between them
 * is <= gapToleranceS seconds (so a pass whose LOS exactly equals the next
 * pass's AOS merges even at gapToleranceS = 0). Passes with losMs <= aosMs
 * are ignored.
 */
export function mergeNetWindows(passes: PassInterval[], gapToleranceS = 0): NetWindow[] {
  const valid = passes.filter((p) => p.losMs > p.aosMs);
  const sorted = [...valid].sort((a, b) => a.aosMs - b.aosMs);
  const toleranceMs = gapToleranceS * 1000;

  const windows: NetWindow[] = [];
  for (const p of sorted) {
    const last = windows[windows.length - 1];
    if (last && p.aosMs - last.endMs <= toleranceMs) {
      last.endMs = Math.max(last.endMs, p.losMs);
      if (!last.stationIds.includes(p.stationId)) last.stationIds.push(p.stationId);
    } else {
      windows.push({ startMs: p.aosMs, endMs: p.losMs, stationIds: [p.stationId] });
    }
  }
  return windows;
}
