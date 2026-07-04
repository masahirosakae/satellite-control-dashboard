/**
 * LIVE_READ_ONLY orbit provider: TLE/GP data from CelesTrak (via the BFF),
 * SGP4 propagation client-side. Read-only by construction — this module has
 * no code path that sends anything to a satellite or ground station.
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
import type { OrbitApiResponse } from "../../../shared/apiTypes";
import { orbitFreshness, ageHours } from "../../domain/freshness";
import { Sgp4OrbitEngine } from "../orbit/Sgp4OrbitEngine";
import { predictPasses } from "../orbit/PassPredictionService";
import type { MissionApi } from "../api/missionApi";
import { type SatelliteDataProvider, unavailableProvenance } from "./SatelliteDataProvider";

const TRACK_CACHE_MS = 20_000;
const PASS_CACHE_MS = 5 * 60_000;

export type ProviderEventSink = (level: "INFO" | "WARN" | "ERROR", type: string, msg: string) => void;

export class CelesTrakOrbitProvider implements SatelliteDataProvider {
  readonly id = "celestrak-orbit";
  readonly label = "CelesTrak Orbit (GP/TLE)";

  private resp: OrbitApiResponse | null = null;
  private engine: Sgp4OrbitEngine | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private wasStaleCache = false;

  private trackCache: { atMs: number; points: { lat: number; lon: number }[] } | null = null;
  private passCache: { atMs: number; stationsKey: string; epoch: string; passes: PassPrediction[] } | null = null;

  constructor(
    private api: MissionApi,
    private profile: SatelliteProfile,
    private onEvent: ProviderEventSink = () => {}
  ) {}

  getSatelliteProfile(): SatelliteProfile {
    return this.profile;
  }

  async refresh(now: Date): Promise<void> {
    const noradId = this.profile.noradId;
    if (noradId === null) return;
    try {
      const resp = await this.api.getOrbit(noradId);
      const engine = new Sgp4OrbitEngine(resp.tleLine1, resp.tleLine2);
      const tleChanged = this.resp?.tleLine1 !== resp.tleLine1;
      this.resp = resp;
      this.engine = engine;
      this.lastSuccessAt = now.toISOString();
      this.wasStaleCache = resp.staleCache;
      if (tleChanged) {
        this.trackCache = null;
        this.passCache = null;
      }
      if (resp.staleCache) {
        this.onEvent("WARN", "ORBIT", `cache fallback used — CelesTrak unreachable (${resp.fetchError ?? "?"}), serving cached TLE`);
      } else {
        this.onEvent("INFO", "ORBIT", `orbit data fetched from CelesTrak (epoch ${resp.epoch})`);
      }
      if (orbitFreshness(resp.epoch, now) === "STALE") {
        this.onEvent("WARN", "ORBIT", `orbit data stale — TLE epoch age ${(ageHours(resp.epoch, now) ?? 0).toFixed(1)}h`);
      }
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : "orbit fetch failed";
      this.lastErrorAt = now.toISOString();
      this.onEvent("ERROR", "ORBIT", `provider request failed — ${this.lastError}`);
      // Keep any previously loaded engine so the UI can show STALE real
      // data. We never substitute simulated data here.
    }
  }

  getOrbitState(now: Date): OrbitState {
    if (!this.resp || !this.engine) {
      return {
        provenance: unavailableProvenance("LIVE_READ_ONLY", "celestrak", "CelesTrak"),
        tle: null,
        tleAgeHours: null,
        position: null,
        track: [],
        error: this.lastError ?? "orbit data not loaded yet",
      };
    }
    const r = this.resp;
    const freshness = orbitFreshness(r.epoch, now);
    const position = this.engine.positionAt(now);

    if (!this.trackCache || now.getTime() - this.trackCache.atMs > TRACK_CACHE_MS) {
      const periodS = this.engine.periodMinutes() * 60;
      this.trackCache = {
        atMs: now.getTime(),
        points: this.engine.groundTrack(now, periodS * 2, 45),
      };
    }

    return {
      provenance: {
        source: "celestrak",
        sourceName: "CelesTrak",
        sourceUrl: r.sourceUrl,
        observedAt: r.epoch,
        fetchedAt: r.fetchedAt,
        dataMode: "LIVE_READ_ONLY",
        freshness,
        isSimulated: false,
        hasRawPayload: true,
      },
      tle: { line1: r.tleLine1, line2: r.tleLine2, name: r.name, noradId: r.noradId, epoch: r.epoch },
      tleAgeHours: ageHours(r.epoch, now),
      position,
      track: this.trackCache.points,
      error: this.lastError,
    };
  }

  /** Passive look angles for the station-visibility display. */
  lookAngles(station: GroundStation, date: Date) {
    return this.engine?.lookAnglesAt(station, date) ?? null;
  }

  getPassPredictions(stations: GroundStation[], now: Date): PassPrediction[] {
    if (!this.engine || !this.resp) return [];
    const stationsKey = JSON.stringify(stations.map((s) => [s.id, s.lat, s.lon, s.altM, s.minElevationDeg]));
    const c = this.passCache;
    if (
      c &&
      c.stationsKey === stationsKey &&
      c.epoch === this.resp.epoch &&
      now.getTime() - c.atMs < PASS_CACHE_MS
    ) {
      return c.passes;
    }
    const passes = predictPasses(this.engine, stations, now, { horizonS: 24 * 3600 });
    this.passCache = { atMs: now.getTime(), stationsKey, epoch: this.resp.epoch, passes };
    return passes;
  }

  getRecentObservations(): ObservationSet {
    return {
      provenance: unavailableProvenance("LIVE_READ_ONLY", "celestrak", "CelesTrak"),
      status: "UNAVAILABLE",
      observations: [],
      error: "observations are provided by the SatNOGS provider",
    };
  }

  getTelemetry(): TelemetrySnapshot {
    return {
      provenance: unavailableProvenance("LIVE_READ_ONLY", "celestrak", "CelesTrak"),
      status: "UNAVAILABLE",
      observedAt: null,
      decoder: null,
      fields: [],
      rawFrame: null,
      error: "telemetry is provided by the SatNOGS provider",
    };
  }

  getProviderHealth(): ProviderHealth[] {
    let status: ProviderHealth["status"] = "IDLE";
    if (this.resp) status = this.lastError ? "ERROR" : this.wasStaleCache ? "DEGRADED" : "OK";
    else if (this.lastError) status = "ERROR";
    return [
      {
        providerId: this.id,
        label: this.label,
        status,
        lastSuccessAt: this.lastSuccessAt,
        lastErrorAt: this.lastErrorAt,
        lastError: this.lastError,
        detail: this.wasStaleCache ? "serving stale cached TLE" : null,
      },
    ];
  }
}
