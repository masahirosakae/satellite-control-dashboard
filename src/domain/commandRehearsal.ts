/**
 * Command Rehearsal — pure domain logic.
 *
 * Rehearsal commands are TRAINING LOG ENTRIES ONLY. This module performs no
 * I/O of any kind: no network, no RF, no uplink. That invariant is enforced
 * by tests (tests/rehearsal.test.ts) and by the `transmitted: false` literal
 * type on CommandRehearsal.
 */
import type { CommandRehearsal, RehearsalMode, RehearsalStatus } from "./types";

export const REHEARSAL_LOG_SUFFIX = "READ-ONLY MODE: COMMAND NOT TRANSMITTED";

export interface RehearsalResult {
  rehearsal: CommandRehearsal;
  logMessage: string;
}

/**
 * @param wallNow real wall-clock time at creation (createdAtWallClock)
 * @param contextNow mission display clock at creation (contextTimestamp) —
 *   LIVE: wall clock; REPLAY: replay cursor. Kept as a separate field from
 *   wallNow, never merged.
 */
export function createCommandRehearsal(
  seq: number,
  name: string,
  param: string | null,
  mode: RehearsalMode,
  wallNow: Date,
  contextNow: Date
): RehearsalResult {
  const id = "RHR-" + String(seq).padStart(3, "0");
  const wallIso = wallNow.toISOString();
  const contextIso = contextNow.toISOString();
  const rehearsal: CommandRehearsal = Object.freeze({
    id,
    name,
    param,
    createdInMode: mode,
    createdAtWallClock: wallIso,
    contextTimestamp: contextIso,
    transmitted: false,
    note: REHEARSAL_LOG_SUFFIX,
    status: "CREATED",
    failReason: null,
  });
  const logMessage =
    id +
    " " +
    name +
    (param ? " [" + param + "]" : "") +
    " recorded (mode " +
    mode +
    ", ctx " +
    contextIso +
    ") — " +
    REHEARSAL_LOG_SUFFIX;
  return { rehearsal, logMessage };
}

/**
 * Rehearsal lifecycle simulation. Every transition below is a purely local,
 * wall-clock-driven state machine — there is no network call, uplink, or
 * spacecraft acknowledgement anywhere in this module. See tests/rehearsal.ts
 * for the network-silence guarantee test.
 */
export const REHEARSAL_ACK_DELAY_MS = 2000;
/** Measured from createdAtWallClock, NOT from the ACK transition. */
export const REHEARSAL_RESULT_DELAY_MS = 5000;
export const REHEARSAL_FAIL_PROBABILITY = 0.15;
export const REHEARSAL_SIM_NOTE = "SIMULATED — NOT TRANSMITTED";

export interface RehearsalAdvance {
  status: RehearsalStatus;
  failReason: string | null;
  logMessages: string[];
}

function logFor(id: string, status: RehearsalStatus, createdInMode: RehearsalMode, contextTimestamp: string): string {
  return (
    id +
    " " +
    status +
    " (" +
    REHEARSAL_SIM_NOTE +
    ") [created " +
    createdInMode +
    ", ctx " +
    contextTimestamp +
    "]"
  );
}

/**
 * Given the current status and elapsed wall-clock time since
 * createdAtWallClock, return the next state reached (if any) — or null when
 * no transition is due yet, or the status is already terminal
 * (REHEARSAL_EXEC / REHEARSAL_FAIL). `roll` is a pre-drawn random number in
 * [0, 1) supplied by the caller (stored per-rehearsal-id at creation time)
 * so this function stays pure.
 *
 * This is a fixpoint reducer: a single call evaluates ALL due transitions,
 * so a CREATED rehearsal that is already >= 5000ms old jumps straight to
 * its terminal state in one call, emitting both the ACK and the terminal
 * log message (in order) — the UI must never observe a stale 1-tick
 * intermediate ACK for an already-overdue rehearsal. Statuses only ever
 * advance forward; no backward or duplicate transitions are possible.
 */
export function advanceRehearsal(
  current: RehearsalStatus,
  elapsedMs: number,
  roll: number,
  id: string,
  createdInMode: RehearsalMode,
  contextTimestamp: string
): RehearsalAdvance | null {
  if (current !== "CREATED" && current !== "REHEARSAL_ACK") return null;

  let status: RehearsalStatus = current;
  let failReason: string | null = null;
  const logMessages: string[] = [];

  if (status === "CREATED" && elapsedMs >= REHEARSAL_ACK_DELAY_MS) {
    status = "REHEARSAL_ACK";
    logMessages.push(logFor(id, status, createdInMode, contextTimestamp));
  }
  if (status === "REHEARSAL_ACK" && elapsedMs >= REHEARSAL_RESULT_DELAY_MS) {
    if (roll < REHEARSAL_FAIL_PROBABILITY) {
      status = "REHEARSAL_FAIL";
      failReason = "training scenario fault injection — not a real spacecraft fault";
    } else {
      status = "REHEARSAL_EXEC";
    }
    logMessages.push(logFor(id, status, createdInMode, contextTimestamp));
  }

  if (logMessages.length === 0) return null;
  return { status, failReason, logMessages };
}

/** Runtime guard mirroring the `transmitted: false` literal type. */
export function assertNotTransmitted(r: CommandRehearsal): void {
  if (r.transmitted !== false) {
    throw new Error("CommandRehearsal invariant violated: transmitted must always be false — " + r.id);
  }
}

/** Command catalogue shared by the simulator console and the rehearsal console. */
export const COMMANDS: { name: string; param: { label: string; default: string } | null }[] = [
  { name: "PING", param: null },
  { name: "RESET_ADCS", param: { label: "AXIS (X/Y/Z)", default: "Z" } },
  { name: "CAPTURE_IMAGE", param: { label: "EXPOSURE [ms]", default: "120" } },
  { name: "START_DOWNLINK", param: { label: "FILE ID", default: "F-002" } },
  { name: "SAFE_MODE", param: null },
];
