/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Control Plane feature-flag input, parsed by
   * src/services/control/ControlPlane.ts::parseControlPlaneMode(). Any
   * value other than "disabled" (case/whitespace insensitive) or unset
   * still resolves to status "DISABLED" — this flag can never enable a
   * real control capability. See docs/safety-and-scope.md.
   */
  readonly VITE_CONTROL_PLANE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
