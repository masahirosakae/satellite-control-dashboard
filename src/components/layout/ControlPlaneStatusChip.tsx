/**
 * Presentational only — no buttons, no click handlers, no configuration
 * affordance of any kind. Renders the (permanently DISABLED) Control Plane
 * status and, when applicable, the (local-only, never-transmitted)
 * Rehearsal Plane status.
 */
import type { ControlPlaneStatus } from "../../services/control/ControlPlane";
import type { RehearsalPlaneStatus } from "../../domain/rehearsalPlane";
import { C, MONO } from "./theme";

export function ControlPlaneStatusChip({
  status,
  rehearsalPlane,
}: {
  status: ControlPlaneStatus;
  rehearsalPlane: RehearsalPlaneStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <div
        className="rounded"
        style={{
          fontFamily: MONO,
          fontSize: 8.5,
          lineHeight: 1.4,
          color: C.dim,
          border: "1px solid " + C.line,
          padding: "2px 7px",
        }}
      >
        <div style={{ letterSpacing: "0.08em" }}>CONTROL PLANE: {status}</div>
        <div style={{ letterSpacing: "0.06em" }}>NO RF / NO UPLINK / NO GROUND-STATION CONTROL</div>
      </div>
      {rehearsalPlane === "LOCAL_ONLY" && (
        <div
          className="rounded"
          style={{
            fontFamily: MONO,
            fontSize: 8.5,
            lineHeight: 1.4,
            color: C.dim,
            border: "1px solid " + C.line,
            padding: "2px 7px",
          }}
        >
          REHEARSAL PLANE: LOCAL ONLY — NOT TRANSMITTED
        </div>
      )}
    </div>
  );
}
