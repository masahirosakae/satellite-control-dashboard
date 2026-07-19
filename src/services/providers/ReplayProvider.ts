/**
 * REPLAY mode: plays back a recorded fixture (past public telemetry /
 * observations) so time evolution, gaps and pass activity can be reviewed
 * without any network access. All data is labeled REPLAY.
 */
import type {
  GroundStation,
  Observation,
  ObservationSet,
  OrbitState,
  PassPrediction,
  ProviderHealth,
  SatelliteProfile,
  TelemetrySnapshot,
  TleSet,
} from "../../domain/types";
import { ageHours } from "../../domain/freshness";
import { mapTelemetryFields } from "../../domain/telemetryMapping";
import { Sgp4OrbitEngine } from "../orbit/Sgp4OrbitEngine";
import { predictPasses } from "../orbit/PassPredictionService";
import type { SatelliteDataProvider } from "./SatelliteDataProvider";

export interface ReplayTelemetryFrame {
  timestamp: string;
  observer: string | null;
  decoderName: string | null;
  frameHex: string | null;
  decoded: Record<string, unknown>;
}

export interface ReplayFixture {
  profile: { name: string; noradId: number; purpose: string };
  tle: TleSet;
  start: string;
  end: string;
  observations: {
    id: string;
    stationName: string;
    start: string;
    end: string;
    frequencyHz: number | null;
    transmitterMode: string | null;
    status: string;
    url: string | null;
  }[];
  telemetryFrames: ReplayTelemetryFrame[];
}

const TRACK_CACHE_MS = 20_000;

export class ReplayProvider implements SatelliteDataProvider {
  readonly id = "replay-fixture";
  readonly label = "Replay Fixture";

  readonly startMs: number;
  readonly endMs: number;
  private engine: Sgp4OrbitEngine | null;
  private initError: string | null = null;
  private trackCache: { atMs: number; startMs: number; stepS: number; points: { lat: number; lon: number }[] } | null =
    null;
  private passCache: { key: string; passes: PassPrediction[] } | null = null;

  constructor(private fixture: ReplayFixture) {
    this.startMs = Date.parse(fixture.start);
    this.endMs = Date.parse(fixture.end);
    try {
      this.engine = new Sgp4OrbitEngine(fixture.tle.line1, fixture.tle.line2);
    } catch (e) {
      this.engine = null;
      this.initError = e instanceof Error ? e.message : "fixture TLE invalid";
    }
  }

  getSatelliteProfile(): SatelliteProfile {
    return { ...this.fixture.profile, mode: "REPLAY" };
  }

  async refresh(): Promise<void> {
    // Fixture data is fully local; nothing to refresh.
  }

  private provenance(observedAt: string | null, hasRaw: boolean) {
    return {
      source: "replay-fixture",
      sourceName: "Replay Fixture (recorded public data)",
      observedAt,
      fetchedAt: this.fixture.start,
      dataMode: "REPLAY" as const,
      freshness: "REPLAY" as const,
      isSimulated: false,
      hasRawPayload: hasRaw,
    };
  }

  /** `now` is the replay clock, not wall time. */
  getOrbitState(now: Date): OrbitState {
    if (!this.engine) {
      return {
        provenance: { ...this.provenance(null, false), freshness: "UNAVAILABLE" },
        tle: null,
        tleAgeHours: null,
        position: null,
        track: [],
        trackStartMs: null,
        trackStepS: null,
        error: this.initError,
      };
    }
    if (!this.trackCache || Math.abs(now.getTime() - this.trackCache.atMs) > TRACK_CACHE_MS) {
      const periodS = this.engine.periodMinutes() * 60;
      const stepS = 45;
      const startMs = now.getTime() - periodS * 1000;
      this.trackCache = {
        atMs: now.getTime(),
        startMs,
        stepS,
        points: this.engine.groundTrack(new Date(startMs), periodS * 3, stepS),
      };
    }
    return {
      provenance: this.provenance(this.fixture.tle.epoch, true),
      tle: this.fixture.tle,
      tleAgeHours: ageHours(this.fixture.tle.epoch, now),
      position: this.engine.positionAt(now),
      track: this.trackCache.points,
      trackStartMs: this.trackCache.startMs,
      trackStepS: this.trackCache.stepS,
      error: null,
    };
  }

  /** Passive look angles for the station-visibility display. */
  lookAngles(station: GroundStation, date: Date) {
    return this.engine?.lookAnglesAt(station, date) ?? null;
  }

  getPassPredictions(stations: GroundStation[], now: Date): PassPrediction[] {
    if (!this.engine) return [];
    const key =
      JSON.stringify(stations.map((s) => [s.id, s.lat, s.lon, s.minElevationDeg])) +
      ":" +
      Math.floor(now.getTime() / (5 * 60_000));
    if (this.passCache?.key === key) return this.passCache.passes;
    const passes = predictPasses(this.engine, stations, now, { horizonS: 24 * 3600 });
    this.passCache = { key, passes };
    return passes;
  }

  /** Observations visible at the current replay clock (started on/before it). */
  getRecentObservations(now?: Date): ObservationSet {
    const cutoff = now ? now.getTime() : this.endMs;
    const observations: Observation[] = this.fixture.observations
      .filter((o) => Date.parse(o.start) <= cutoff)
      .map((o) => ({ ...o }));
    return {
      provenance: this.provenance(observations.at(-1)?.start ?? null, false),
      status: observations.length > 0 ? "OK" : "NO_DATA",
      observations: observations.reverse(),
      error: null,
    };
  }

  /** Latest telemetry frame received at/before the replay clock. */
  getTelemetry(now?: Date): TelemetrySnapshot {
    const cutoff = now ? now.getTime() : this.endMs;
    const past = this.fixture.telemetryFrames
      .filter((f) => Date.parse(f.timestamp) <= cutoff)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const frame = past.at(-1) ?? null;
    if (!frame) {
      return {
        provenance: this.provenance(null, false),
        status: "NO_DATA",
        observedAt: null,
        decoder: null,
        fields: [],
        rawFrame: null,
        error: "no frame received yet at this replay time",
      };
    }
    const { fields } = mapTelemetryFields(frame.decoded);
    return {
      provenance: this.provenance(frame.timestamp, frame.frameHex !== null),
      status: "OK",
      observedAt: frame.timestamp,
      decoder: frame.decoderName,
      fields,
      rawFrame: frame.frameHex,
      error: null,
    };
  }

  getProviderHealth(): ProviderHealth[] {
    return [
      {
        providerId: this.id,
        label: this.label,
        status: this.engine ? "OK" : "ERROR",
        lastSuccessAt: this.engine ? this.fixture.start : null,
        lastErrorAt: null,
        lastError: this.initError,
        detail: `fixture window ${this.fixture.start} → ${this.fixture.end}`,
        requestState: "SUCCEEDED",
        failureReason: null,
      },
    ];
  }
}
