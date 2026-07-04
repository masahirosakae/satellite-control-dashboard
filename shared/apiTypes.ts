/**
 * DTOs exchanged between the BFF server (server/) and the client (src/).
 * The BFF normalizes CelesTrak / SatNOGS payloads into these shapes so the
 * client never talks to (or knows about) the upstream APIs directly.
 */

export interface OrbitApiResponse {
  noradId: number;
  name: string | null;
  tleLine1: string;
  tleLine2: string;
  /** TLE epoch, ISO-8601 UTC */
  epoch: string;
  /** When the BFF fetched this from the upstream, ISO-8601 UTC */
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  /** true when the upstream fetch failed and this is served from an old cache */
  staleCache: boolean;
  fetchError: string | null;
}

export interface ApiErrorResponse {
  error: string;
}

export interface ObservationDto {
  id: number | string;
  stationName: string | null;
  start: string | null;
  end: string | null;
  frequencyHz: number | null;
  transmitterMode: string | null;
  status: string | null;
  waterfallStatus: string | null;
  url: string | null;
}

export type ObservationsApiStatus = "OK" | "NO_DATA" | "ERROR";

export interface ObservationsApiResponse {
  status: ObservationsApiStatus;
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  observations: ObservationDto[];
  error: string | null;
}

export interface TelemetryEntryDto {
  /** When the frame was received by the observer, ISO-8601 UTC (if known) */
  timestamp: string | null;
  observer: string | null;
  appSource: string | null;
  /**
   * Decoded key/value fields if the upstream returned structured decoded
   * data. SatNOGS decoders differ per satellite — never assume fixed keys.
   */
  decoded: Record<string, unknown> | null;
  /** Raw frame as hex string, when available */
  frameHex: string | null;
  decoderName: string | null;
}

export type TelemetryApiStatus = "OK" | "NO_DATA" | "TOKEN_MISSING" | "ERROR";

export interface TelemetryApiResponse {
  status: TelemetryApiStatus;
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  entries: TelemetryEntryDto[];
  error: string | null;
}
