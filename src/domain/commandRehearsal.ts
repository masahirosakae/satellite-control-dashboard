/**
 * Command Rehearsal — pure domain logic.
 *
 * Rehearsal commands are TRAINING LOG ENTRIES ONLY. This module performs no
 * I/O of any kind: no network, no RF, no uplink. That invariant is enforced
 * by tests (tests/rehearsal.test.ts) and by the `transmitted: false` literal
 * type on CommandRehearsal.
 */
import type { CommandRehearsal, MissionMode } from "./types";

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
  };
  const logMessage =
    id + " " + name + (param ? " [" + param + "]" : "") + " recorded — " + REHEARSAL_LOG_SUFFIX;
  return { rehearsal, logMessage };
}

/** Command catalogue shared by the simulator console and the rehearsal console. */
export const COMMANDS: { name: string; param: { label: string; default: string } | null }[] = [
  { name: "PING", param: null },
  { name: "RESET_ADCS", param: { label: "AXIS (X/Y/Z)", default: "Z" } },
  { name: "CAPTURE_IMAGE", param: { label: "EXPOSURE [ms]", default: "120" } },
  { name: "START_DOWNLINK", param: { label: "FILE ID", default: "F-002" } },
  { name: "SAFE_MODE", param: null },
];
