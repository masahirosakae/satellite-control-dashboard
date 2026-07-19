/**
 * The sole Control Plane adapter shipped in v0.2.0. Every control method
 * throws immediately and unconditionally; no I/O of any kind is performed.
 * The constructor takes no arguments — there are no destinations, devices,
 * or secrets to configure, because none exist in this application.
 */
import {
  CONTROL_PLANE_DISABLED,
  type ControlPlaneCapabilities,
  type ControlPlanePort,
  type ControlPlaneStatus,
} from "./ControlPlane";

const DISABLED_CAPABILITIES: ControlPlaneCapabilities = Object.freeze({
  status: "DISABLED",
  canTransmitCommand: false,
  canTransmitRf: false,
  canControlAntenna: false,
  canControlGroundStation: false,
  canPerformOtaUpdate: false,
});

export class DisabledControlPlaneAdapter implements ControlPlanePort {
  readonly capabilities: ControlPlaneCapabilities = DISABLED_CAPABILITIES;

  getStatus(): ControlPlaneStatus {
    return "DISABLED";
  }

  transmitCommand(): never {
    throw new Error(CONTROL_PLANE_DISABLED);
  }

  transmitRf(): never {
    throw new Error(CONTROL_PLANE_DISABLED);
  }

  controlAntenna(): never {
    throw new Error(CONTROL_PLANE_DISABLED);
  }

  controlGroundStation(): never {
    throw new Error(CONTROL_PLANE_DISABLED);
  }

  performOtaUpdate(): never {
    throw new Error(CONTROL_PLANE_DISABLED);
  }
}
