/**
 * Wraps the virtual-satellite Simulator behind the common provider
 * interface. Everything it returns is flagged isSimulated / SIMULATED.
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
import { simSatPosition, SIM_ORBIT_PERIOD_S } from "../../domain/simpleOrbit";
import { mapTelemetryFields } from "../../domain/telemetryMapping";
import { Simulator, simDate } from "../simulator/Simulator";
import type { SatelliteDataProvider } from "./SatelliteDataProvider";

export class SimulatorProvider implements SatelliteDataProvider {
  readonly id = "simulator";
  readonly label = "Virtual Satellite Simulator";

  constructor(public sim: Simulator) {}

  getSatelliteProfile(): SatelliteProfile {
    return {
      name: "SORA-1",
      noradId: null,
      mode: "SIMULATED",
      purpose: "Virtual CubeSat for operations training",
    };
  }

  async refresh(): Promise<void> {
    // The simulator advances via its own tick loop.
  }

  private provenance(observedAt: string | null) {
    return {
      source: "simulator",
      sourceName: "Simulator (virtual satellite)",
      observedAt,
      fetchedAt: observedAt,
      dataMode: "SIMULATED" as const,
      freshness: "SIMULATED" as const,
      isSimulated: true,
      hasRawPayload: false,
    };
  }

  getOrbitState(): OrbitState {
    const t = this.sim.simT;
    const pos = simSatPosition(t);
    const track: { lat: number; lon: number }[] = [];
    for (let dt = 0; dt <= SIM_ORBIT_PERIOD_S * 2; dt += 45) {
      track.push(simSatPosition(t + dt));
    }
    return {
      provenance: this.provenance(simDate(t).toISOString()),
      tle: null,
      tleAgeHours: null,
      position: { ...pos, altKm: 410, velocityKmS: 7.66 },
      track,
      error: null,
    };
  }

  getPassPredictions(_stations: GroundStation[], _now: Date): PassPrediction[] {
    return this.sim.passes.map((p) => ({
      stationId: p.stationId,
      aos: simDate(p.aos).toISOString(),
      los: simDate(p.los).toISOString(),
      durationS: Math.round(p.los - p.aos),
      maxElevationDeg: 0,
      maxElevationAt: simDate((p.aos + p.los) / 2).toISOString(),
      aosAzimuthDeg: 0,
      losAzimuthDeg: 0,
    }));
  }

  getRecentObservations(): ObservationSet {
    return {
      provenance: this.provenance(null),
      status: "UNAVAILABLE",
      observations: [],
      error: "SIMULATED mode uses the virtual downlink panel instead of observations",
    };
  }

  getTelemetry(): TelemetrySnapshot {
    const snap = this.sim.snapshotCache;
    const { fields } = mapTelemetryFields({
      battV: snap.tlm.battV,
      battI: snap.tlm.battI,
      temp: snap.tlm.temp,
      cpu: snap.tlm.cpu,
      signal: snap.tlm.signal,
      storage: snap.tlm.storage,
    });
    return {
      provenance: this.provenance(simDate(snap.t).toISOString()),
      status: "OK",
      observedAt: simDate(snap.t).toISOString(),
      decoder: "simulator",
      fields,
      rawFrame: null,
      error: null,
    };
  }

  getProviderHealth(): ProviderHealth[] {
    return [
      {
        providerId: this.id,
        label: this.label,
        status: "OK",
        lastSuccessAt: new Date().toISOString(),
        lastErrorAt: null,
        lastError: null,
        detail: `sim time ×${this.sim.speed}, ${this.sim.running ? "running" : "paused"}`,
      },
    ];
  }
}
