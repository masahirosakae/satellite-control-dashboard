/** Classify "where are we relative to the net contact schedule" at a given instant. Pure, no I/O. */
import type { NetWindow } from "./netWindow";

export const PREP_THRESHOLD_S = 600;

export type ContactPhase = "CONTACT" | "PREP" | "IDLE" | "NO_WINDOW";

export interface ContactPhaseInfo {
  phase: ContactPhase;
  /** The window currently in progress, set only when phase === "CONTACT". */
  activeWindow: NetWindow | null;
  /** The next window with startMs > nowMs, or null if none remain. */
  nextWindow: NetWindow | null;
  /** Time to the next window's AOS, in ms. Set when PREP/IDLE and a next window exists. */
  tToAosMs: number | null;
  /** Time to the active window's LOS, in ms. Set when phase === "CONTACT". */
  tToLosMs: number | null;
}

/** `windows` must be sorted ascending by startMs and non-overlapping (as produced by mergeNetWindows). */
export function contactPhaseAt(nowMs: number, windows: NetWindow[]): ContactPhaseInfo {
  const active = windows.find((w) => w.startMs <= nowMs && nowMs < w.endMs) ?? null;
  const next = windows.find((w) => w.startMs > nowMs) ?? null;

  if (active) {
    return {
      phase: "CONTACT",
      activeWindow: active,
      nextWindow: next,
      tToAosMs: null,
      tToLosMs: active.endMs - nowMs,
    };
  }

  if (!next) {
    return { phase: "NO_WINDOW", activeWindow: null, nextWindow: null, tToAosMs: null, tToLosMs: null };
  }

  const tToAosMs = next.startMs - nowMs;
  const phase: ContactPhase = tToAosMs <= PREP_THRESHOLD_S * 1000 ? "PREP" : "IDLE";
  return { phase, activeWindow: null, nextWindow: next, tToAosMs, tToLosMs: null };
}
