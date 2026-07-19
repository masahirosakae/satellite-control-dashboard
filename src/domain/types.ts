/** Core domain types. UI components depend on these, never on upstream API shapes. */

export type MissionMode = "SIMULATED" | "LIVE_READ_ONLY" | "REPLAY";

/** Spacecraft operating mode (only meaningful for the simulated satellite). */
export type SatelliteMode = "NOMINAL" | "SAFE" | "UNKNOWN";

export type FreshnessStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "UNAVAILABLE"
  | "SIMULATED"
  | "REPLAY";

export interface DataProvenance {
  /** Machine-ish id of the source, e.g. "celestrak", "satnogs-db", "simulator" */
  source: string;
  sourceName: string;
  sourceUrl?: string;
  /** When the underlying measurement was made (TLE epoch / frame timestamp) */
  observedAt: string | null;
  /** When our system fetched it */
  fetchedAt: string | null;
  dataMode: MissionMode;
  freshness: FreshnessStatus;
  isSimulated: boolean;
  hasRawPayload: boolean;
}

export interface SatelliteProfile {
  name: string;
  noradId: number | null;
  mode: MissionMode;
  purpose: string;
}

export interface TleSet {
  line1: string;
  line2: string;
  name: string | null;
  noradId: number;
  /** ISO-8601 UTC */
  epoch: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface OrbitPosition extends GeoPoint {
  altKm: number;
  velocityKmS: number;
}

export interface OrbitState {
  provenance: DataProvenance;
  tle: TleSet | null;
  tleAgeHours: number | null;
  position: OrbitPosition | null;
  /** Ground track samples spanning [trackStartMs, trackStartMs + (track.length-1)*trackStepS*1000]. */
  track: GeoPoint[];
  /** Unix ms timestamp of track[0], or null when track is empty. */
  trackStartMs: number | null;
  /** Sampling interval (seconds) between consecutive track points, or null when track is empty. */
  trackStepS: number | null;
  error: string | null;
}

export interface GroundStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altM: number;
  minElevationDeg: number;
  /** true for the built-in demo stations (never a real user address) */
  isSample: boolean;
}

export interface LookAngles {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

export interface PassPrediction {
  stationId: string;
  /** ISO-8601 UTC */
  aos: string;
  los: string;
  durationS: number;
  maxElevationDeg: number;
  maxElevationAt: string;
  aosAzimuthDeg: number;
  losAzimuthDeg: number;
}

export interface Observation {
  id: number | string;
  stationName: string;
  start: string | null;
  end: string | null;
  frequencyHz: number | null;
  transmitterMode: string | null;
  status: string;
  url: string | null;
}

export type ObservationSetStatus = "OK" | "NO_DATA" | "ERROR" | "UNAVAILABLE";

export interface ObservationSet {
  provenance: DataProvenance;
  status: ObservationSetStatus;
  observations: Observation[];
  error: string | null;
}

export interface TelemetryField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit: string | null;
  /** true when the key matched our known-field mapping layer */
  mapped: boolean;
}

export type TelemetryStatus = "OK" | "NO_DATA" | "TOKEN_MISSING" | "ERROR" | "UNAVAILABLE";

export interface TelemetrySnapshot {
  provenance: DataProvenance;
  status: TelemetryStatus;
  observedAt: string | null;
  decoder: string | null;
  fields: TelemetryField[];
  rawFrame: string | null;
  error: string | null;
}

export interface TelemetrySeriesPoint {
  t: number; // epoch ms
  value: number;
}

export interface TelemetrySeries {
  key: string;
  label: string;
  unit: string | null;
  points: TelemetrySeriesPoint[];
}

/**
 * Rehearsal lifecycle: CREATED -> REHEARSAL_ACK -> REHEARSAL_EXEC | REHEARSAL_FAIL.
 * All transitions are wall-clock-driven simulation only — see
 * domain/commandRehearsal.ts. No state here ever corresponds to a real
 * uplink or spacecraft acknowledgement.
 */
export type RehearsalStatus = "CREATED" | "REHEARSAL_ACK" | "REHEARSAL_EXEC" | "REHEARSAL_FAIL";

/**
 * A command rehearsal entry. `transmitted` is typed as literal `false`:
 * this application NEVER transmits commands to a real spacecraft.
 */
export interface CommandRehearsal {
  id: string;
  name: string;
  param: string | null;
  createdAt: string;
  mode: MissionMode;
  transmitted: false;
  note: string;
  status: RehearsalStatus;
  failReason: string | null;
}

export type ProviderStatus = "OK" | "DEGRADED" | "ERROR" | "TOKEN_MISSING" | "IDLE";

export interface ProviderHealth {
  providerId: string;
  label: string;
  status: ProviderStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  detail: string | null;
}

export interface EventLogEntry {
  id: string;
  /** epoch ms (wall clock) */
  at: number;
  level: "INFO" | "WARN" | "ERROR";
  type: string;
  msg: string;
}
