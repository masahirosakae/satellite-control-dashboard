/**
 * Control Plane — boundary/interface layer ONLY.
 *
 * This module defines the *shape* of a control plane (status, capability
 * flags, a port interface) and a mode parser. It intentionally does NOT
 * define, and must never come to define, any real control capability:
 * no packet formats, no frequencies, no destination URLs, no device types,
 * no uplink/RF/rotor/ground-station/OTA behavior.
 *
 * v0.2.0 ships exactly one status: "DISABLED". There is no code path in
 * this module, or in any adapter implementing ControlPlanePort, that can
 * yield a status other than "DISABLED". A feature flag (see
 * parseControlPlaneMode) can never toggle a real capability on — any raw
 * input other than the literal string "disabled" (case/whitespace
 * insensitive) or an unset value still resolves to "DISABLED", merely
 * flagging the unrecognized value for operator visibility/logging.
 *
 * This application is READ-ONLY. See DisabledControlPlane.ts for the sole
 * adapter, which throws on every control method and performs no I/O.
 */

export type ControlPlaneStatus = "DISABLED"; // v0.2.0: DISABLED only — no other member

export interface ControlPlaneCapabilities {
  readonly status: ControlPlaneStatus;
  readonly canTransmitCommand: false;
  readonly canTransmitRf: false;
  readonly canControlAntenna: false;
  readonly canControlGroundStation: false;
  readonly canPerformOtaUpdate: false;
}

export const CONTROL_PLANE_DISABLED = "CONTROL_PLANE_DISABLED" as const;

export interface ControlPlanePort {
  readonly capabilities: ControlPlaneCapabilities;
  getStatus(): ControlPlaneStatus;
  transmitCommand(): never;
  transmitRf(): never;
  controlAntenna(): never;
  controlGroundStation(): never;
  performOtaUpdate(): never;
}

export interface ControlPlaneModeParse {
  status: ControlPlaneStatus; // always "DISABLED" in v0.2.0
  unrecognizedValue: string | null; // set when raw was present but not an accepted value
}

/**
 * Parses a raw feature-flag-ish value into a ControlPlaneModeParse. Trims
 * and lowercases before comparison. Unset (undefined/null/empty string)
 * quietly resolves to DISABLED with no warning. "disabled" (any
 * case/whitespace) resolves to DISABLED with no warning. Any other
 * non-empty value still resolves to DISABLED, but is reported via
 * unrecognizedValue (set to the ORIGINAL raw string, not the normalized
 * one) so callers can log/surface that the value was not understood —
 * this never enables any control capability.
 */
export function parseControlPlaneMode(raw: string | undefined | null): ControlPlaneModeParse {
  if (raw === undefined || raw === null) {
    return { status: "DISABLED", unrecognizedValue: null };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") {
    return { status: "DISABLED", unrecognizedValue: null };
  }
  if (normalized === "disabled") {
    return { status: "DISABLED", unrecognizedValue: null };
  }
  return { status: "DISABLED", unrecognizedValue: raw };
}
