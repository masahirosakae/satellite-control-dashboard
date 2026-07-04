/**
 * Provider abstraction. UI components and the store only ever see this
 * interface plus domain types — they never know whether data comes from the
 * simulator, CelesTrak, SatNOGS or a replay fixture.
 *
 * Getters are synchronous reads of the provider's current state; `refresh`
 * performs the (possibly async) data acquisition and never throws — failures
 * are surfaced through getProviderHealth() and the returned states.
 */
import type {
  GroundStation,
  ObservationSet,
  OrbitState,
  PassPrediction,
  ProviderHealth,
  SatelliteProfile,
  TelemetrySnapshot,
} from "../../domain/types";

export interface SatelliteDataProvider {
  readonly id: string;
  readonly label: string;
  getSatelliteProfile(): SatelliteProfile;
  getOrbitState(now: Date): OrbitState;
  getPassPredictions(stations: GroundStation[], now: Date): PassPrediction[];
  getRecentObservations(): ObservationSet;
  getTelemetry(): TelemetrySnapshot;
  getProviderHealth(): ProviderHealth[];
  refresh(now: Date): Promise<void>;
}

export const unavailableProvenance = (
  dataMode: "SIMULATED" | "LIVE_READ_ONLY" | "REPLAY",
  source: string,
  sourceName: string
) => ({
  source,
  sourceName,
  observedAt: null,
  fetchedAt: null,
  dataMode,
  freshness: "UNAVAILABLE" as const,
  isSimulated: false,
  hasRawPayload: false,
});
