/**
 * Single source of truth tying advisories and the ops checklist together:
 * both are derived from the SAME OperationalSnapshot object, so they can
 * never disagree about the underlying request/health state (e.g. an
 * advisory firing while the checklist still reads PENDING). Pure, no I/O.
 */
import type { ContactPhaseInfo } from "./contactPhase";
import type {
  GroundStation,
  MissionMode,
  OrbitState,
  ProviderHealth,
  ProviderRequestState,
  TelemetrySnapshot,
} from "./types";
import { deriveAdvisories, type Advisory } from "./advisory";
import { buildOpsChecklist, type ChecklistItem } from "./opsChecklist";

export interface OperationalSnapshot {
  mode: MissionMode;
  orbit: OrbitState;
  orbitRequest: ProviderRequestState;
  telemetry: TelemetrySnapshot;
  tlmRequest: ProviderRequestState;
  health: ProviderHealth[];
  stations: GroundStation[];
  phase: ContactPhaseInfo;
}

export interface OperationalAssessment {
  advisories: Advisory[];
  checklist: ChecklistItem[];
}

export function deriveOperationalAssessment(snapshot: OperationalSnapshot): OperationalAssessment {
  const { mode, orbit, orbitRequest, telemetry, tlmRequest, health, stations, phase } = snapshot;
  const advisories = deriveAdvisories({ mode, orbit, orbitRequest, telemetry, tlmRequest, health });
  const checklist = buildOpsChecklist({ orbit, orbitRequest, telemetry, tlmRequest, health, stations, phase });
  return { advisories, checklist };
}
