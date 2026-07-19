/**
 * Rehearsal Plane status — deliberately separate from the Control Plane
 * model (src/services/control/ControlPlane.ts). Rehearsal is always
 * local-only: it never performs I/O, never transmits (see
 * CommandRehearsal.transmitted, always literal `false`), and is never a
 * control capability. This module merely derives a display status from
 * the current MissionMode; it holds no state and touches no network.
 */
import type { MissionMode } from "./types";

export type RehearsalPlaneStatus = "LOCAL_ONLY" | "NOT_APPLICABLE";

export function deriveRehearsalPlaneStatus(mode: MissionMode): RehearsalPlaneStatus {
  return mode === "SIMULATED" ? "NOT_APPLICABLE" : "LOCAL_ONLY";
}
