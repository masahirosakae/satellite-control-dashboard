/**
 * Command Rehearsal — pure domain logic.
 *
 * Rehearsal commands are TRAINING LOG ENTRIES ONLY. This module performs no
 * I/O of any kind: no network, no RF, no uplink. That invariant is enforced
 * by tests (tests/rehearsal.test.ts) and by the `transmitted: false` literal
 * type on CommandRehearsal.
 */
import type { CommandRehearsal, MissionMode, RehearsalStatus } from "./types";

export const REHEARSAL_LOG_SUFFIX = "READ-ONLY MODE: COMMAND NOT TRANSMITTED";

export interface RehearsalResult {
  rehearsal: CommandRehearsal;
  logMessage: string;
}

export function createCommandRehearsal(
  seq: number,
  name: string,
  param: string | null,
  mode: MissionMode,
  now: Date
): RehearsalResult {
  const id = "RHR-" + String(seq).padStart(3, "0");
  const rehearsal: CommandRehearsal = {
    id,
    name,
    param,
    createdAt: now.toISOString(),
    mode,
    transmitted: false,
    note: REHEARSAL_LOG_SUFFIX,
    status: "CREATED",
    failReason: null,
  };
  const logMessage =
    id + " " + name + (param ? " [" + param + "]" : "") + " recorded — " + REHEARSAL_LOG_SUFFIX;
  return { rehearsal, logMessage };
}

/**
 * Rehearsal lifecycle simulation. Every transition below is a purely local,
 * wall-clock-driven state machine — there is no network call, uplink, or
 * spacecraft acknowledgement anywhere in this module. See tests/rehearsal.ts
 * for the network-silence guarantee test.
 */
export const REHEARSAL_ACK_DELAY_MS = 2000;
/** Measured from createdAt, NOT from the ACK transition. */
export const REHEARSAL_RESULT_DELAY_MS = 5000;
export const REHEARSAL_FAIL_PROBABILITY = 0.15;
export const REHEARSAL_SIM_NOTE = "SIMULATED — NOT TRANSMITTED";

export interface RehearsalTransition {
  status: RehearsalStatus;
  failReason: string | null;
  logMessage: string;
}

/**
 * Given the current status and elapsed wall-clock time since createdAt,
 * return the next transition (if any) — or null when no transition is due
 * yet, or the status is already terminal (REHEARSAL_EXEC / REHEARSAL_FAIL).
 * `roll` is a pre-drawn random number in [0, 1) supplied by the caller
 * (stored per-rehearsal-id at creation time) so this function stays pure.
 */
export function rehearsalTransition(
  current: RehearsalStatus,
  elapsedMs: number,
  roll: number,
  id: string
): RehearsalTransition | null {
  let next: RehearsalStatus | null = null;
  let failReason: string | null = null;

  if (current === "CREATED" && elapsedMs >= REHEARSAL_ACK_DELAY_MS) {
    next = "REHEARSAL_ACK";
  } else if (current === "REHEARSAL_ACK" && elapsedMs >= REHEARSAL_RESULT_DELAY_MS) {
    if (roll < REHEARSAL_FAIL_PROBABILITY) {
      next = "REHEARSAL_FAIL";
      failReason = "simulated fault injection (training scenario)";
    } else {
      next = "REHEARSAL_EXEC";
    }
  }

  if (next === null) return null;
  return { status: next, failReason, logMessage: id + " " + next + " (" + REHEARSAL_SIM_NOTE + ")" };
}

/** Command catalogue shared by the simulator console and the rehearsal console. */
export const COMMANDS: { name: string; param: { label: string; default: string } | null }[] = [
  { name: "PING", param: null },
  { name: "RESET_ADCS", param: { label: "AXIS (X/Y/Z)", default: "Z" } },
  { name: "CAPTURE_IMAGE", param: { label: "EXPOSURE [ms]", default: "120" } },
  { name: "START_DOWNLINK", param: { label: "FILE ID", default: "F-002" } },
  { name: "SAFE_MODE", param: null },
];
