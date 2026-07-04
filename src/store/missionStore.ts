/**
 * MissionStore — single orchestration point for the three mission modes.
 *
 * Invariants enforced here:
 *  - Mode switches are ALWAYS explicit user actions (no silent fallback from
 *    LIVE_READ_ONLY to SIMULATED when live data fails).
 *  - In LIVE_READ_ONLY / REPLAY, commands only create rehearsal log entries;
 *    nothing is ever transmitted anywhere.
 *  - Live data failures degrade to labeled STALE/UNAVAILABLE states.
 */
import type {
  CommandRehearsal,
  EventLogEntry,
  GroundStation,
  MissionMode,
  ObservationSet,
  OrbitState,
  PassPrediction,
  ProviderHealth,
  SatelliteProfile,
  TelemetrySnapshot,
} from "../domain/types";
import { createCommandRehearsal } from "../domain/commandRehearsal";
import { Simulator, simDate } from "../services/simulator/Simulator";
import { MissionApi } from "../services/api/missionApi";
import { SimulatorProvider } from "../services/providers/SimulatorProvider";
import { CelesTrakOrbitProvider } from "../services/providers/CelesTrakOrbitProvider";
import { SatNogsObservationProvider } from "../services/providers/SatNogsObservationProvider";
import { SatNogsTelemetryProvider } from "../services/providers/SatNogsTelemetryProvider";
import { ReplayProvider, type ReplayFixture } from "../services/providers/ReplayProvider";
import { loadStations, saveStations } from "./groundStations";
import replayFixtureJson from "../fixtures/sonate2-replay.json";

export const LIVE_SATELLITE: SatelliteProfile = {
  name: "SONATE-2",
  noradId: 59112,
  mode: "LIVE_READ_ONLY",
  purpose: "Public-data visualization demo of an AI-equipped CubeSat",
};

const ORBIT_REFRESH_S = 600;
const SATNOGS_REFRESH_S = 180;
const TICK_MS = 250;

export class MissionStore {
  mode: MissionMode = "SIMULATED";
  stations: GroundStation[];
  sim: Simulator;
  simProvider: SimulatorProvider;
  liveOrbit: CelesTrakOrbitProvider;
  liveObs: SatNogsObservationProvider;
  liveTlm: SatNogsTelemetryProvider;
  replay: ReplayProvider;

  replayRunning = true;
  replaySpeed = 60;
  replayMs: number;

  rehearsals: CommandRehearsal[] = [];
  events: EventLogEntry[] = [];
  version = 0;

  private rehearsalSeq = 0;
  private eventSeq = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastOrbitRefresh = 0;
  private lastSatnogsRefresh = 0;
  private refreshing = false;

  constructor(private api: MissionApi = new MissionApi()) {
    this.stations = loadStations();
    this.sim = new Simulator(this.stations);
    this.simProvider = new SimulatorProvider(this.sim);
    const sink = (level: EventLogEntry["level"], type: string, msg: string) =>
      this.logEvent(level, type, msg);
    this.liveOrbit = new CelesTrakOrbitProvider(this.api, LIVE_SATELLITE, sink);
    this.liveObs = new SatNogsObservationProvider(this.api, LIVE_SATELLITE.noradId as number, sink);
    this.liveTlm = new SatNogsTelemetryProvider(this.api, LIVE_SATELLITE.noradId as number, sink);
    this.replay = new ReplayProvider(replayFixtureJson as unknown as ReplayFixture);
    this.replayMs = this.replay.startMs;
    this.logEvent("INFO", "SYS", "Mission dashboard initialized (mode: SIMULATED)");
  }

  /* ---------- subscription ---------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.mode === "SIMULATED") {
      this.sim.tick(TICK_MS / 1000);
    } else if (this.mode === "REPLAY" && this.replayRunning) {
      this.replayMs += TICK_MS * this.replaySpeed;
      if (this.replayMs >= this.replay.endMs) {
        this.replayMs = this.replay.endMs;
        this.replayRunning = false;
        this.logEvent("INFO", "REPLAY", "replay reached end of fixture window");
      }
    } else if (this.mode === "LIVE_READ_ONLY") {
      void this.refreshLiveIfDue();
    }
    this.notify();
  }

  private async refreshLiveIfDue(): Promise<void> {
    const nowMs = Date.now();
    if (this.refreshing) return;
    const orbitDue = nowMs - this.lastOrbitRefresh > ORBIT_REFRESH_S * 1000;
    const satnogsDue = nowMs - this.lastSatnogsRefresh > SATNOGS_REFRESH_S * 1000;
    if (!orbitDue && !satnogsDue) return;
    this.refreshing = true;
    try {
      const now = new Date();
      const jobs: Promise<void>[] = [];
      if (orbitDue) {
        this.lastOrbitRefresh = nowMs;
        jobs.push(this.liveOrbit.refresh(now));
      }
      if (satnogsDue) {
        this.lastSatnogsRefresh = nowMs;
        jobs.push(this.liveObs.refresh(now), this.liveTlm.refresh(now));
      }
      await Promise.allSettled(jobs);
    } finally {
      this.refreshing = false;
      this.notify();
    }
  }

  /* ---------- mode ---------- */

  setMode(mode: MissionMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.logEvent("INFO", "MODE", `mode switched to ${mode}`);
    if (mode === "LIVE_READ_ONLY") {
      // force immediate refresh
      this.lastOrbitRefresh = 0;
      this.lastSatnogsRefresh = 0;
    }
    if (mode === "REPLAY" && this.replayMs >= this.replay.endMs) {
      this.replayMs = this.replay.startMs;
      this.replayRunning = true;
    }
    this.notify();
  }

  /* ---------- unified read accessors (UI uses only these) ---------- */

  get profile(): SatelliteProfile {
    if (this.mode === "SIMULATED") return this.simProvider.getSatelliteProfile();
    if (this.mode === "REPLAY") return this.replay.getSatelliteProfile();
    return LIVE_SATELLITE;
  }

  /** Mission clock: sim time in SIMULATED, replay clock in REPLAY, wall clock in LIVE. */
  get displayNow(): Date {
    if (this.mode === "REPLAY") return new Date(this.replayMs);
    if (this.mode === "SIMULATED") return simDate(this.sim.simT);
    return new Date();
  }

  getOrbitState(): OrbitState {
    if (this.mode === "SIMULATED") return this.simProvider.getOrbitState();
    if (this.mode === "REPLAY") return this.replay.getOrbitState(new Date(this.replayMs));
    return this.liveOrbit.getOrbitState(new Date());
  }

  getPassPredictions(): PassPrediction[] {
    if (this.mode === "SIMULATED") return this.simProvider.getPassPredictions(this.stations, new Date());
    if (this.mode === "REPLAY") return this.replay.getPassPredictions(this.stations, new Date(this.replayMs));
    return this.liveOrbit.getPassPredictions(this.stations, new Date());
  }

  getObservations(): ObservationSet {
    if (this.mode === "SIMULATED") return this.simProvider.getRecentObservations();
    if (this.mode === "REPLAY") return this.replay.getRecentObservations(new Date(this.replayMs));
    return this.liveObs.getRecentObservations();
  }

  getTelemetry(): TelemetrySnapshot {
    if (this.mode === "SIMULATED") return this.simProvider.getTelemetry();
    if (this.mode === "REPLAY") return this.replay.getTelemetry(new Date(this.replayMs));
    return this.liveTlm.getTelemetry(new Date());
  }

  getProviderHealth(): ProviderHealth[] {
    if (this.mode === "SIMULATED") return this.simProvider.getProviderHealth();
    if (this.mode === "REPLAY") return this.replay.getProviderHealth();
    return [
      ...this.liveOrbit.getProviderHealth(),
      this.liveObs.getProviderHealth(),
      this.liveTlm.getProviderHealth(),
    ];
  }

  /* ---------- commands ---------- */

  /** SIMULATED mode: virtual uplink to the simulator. */
  sendSimCommand(name: string, param: string | null): void {
    this.sim.sendCommand(name, param, this.sim.snapshotCache.inLink);
    this.notify();
  }

  /**
   * LIVE_READ_ONLY / REPLAY: create a rehearsal entry ONLY.
   * No network, no RF, no uplink — see domain/commandRehearsal.ts.
   */
  createRehearsal(name: string, param: string | null): CommandRehearsal {
    const { rehearsal, logMessage } = createCommandRehearsal(
      ++this.rehearsalSeq,
      name,
      param,
      this.mode,
      new Date()
    );
    this.rehearsals.unshift(rehearsal);
    if (this.rehearsals.length > 50) this.rehearsals.pop();
    this.logEvent("INFO", "RHRSL", "rehearsal command created — " + logMessage);
    this.notify();
    return rehearsal;
  }

  /* ---------- replay controls ---------- */

  replayPlay(): void {
    if (this.replayMs >= this.replay.endMs) this.replayMs = this.replay.startMs;
    this.replayRunning = true;
    this.notify();
  }
  replayPause(): void {
    this.replayRunning = false;
    this.notify();
  }
  replayRestart(): void {
    this.replayMs = this.replay.startMs;
    this.replayRunning = true;
    this.logEvent("INFO", "REPLAY", "replay restarted from fixture start");
    this.notify();
  }
  setReplaySpeed(s: number): void {
    this.replaySpeed = s;
    this.notify();
  }

  /* ---------- ground stations ---------- */

  setStations(stations: GroundStation[]): void {
    this.stations = stations;
    saveStations(stations);
    this.sim.setStations(stations);
    this.logEvent("INFO", "GS", `ground stations updated (${stations.length})`);
    this.notify();
  }
  addStation(s: GroundStation): void {
    this.setStations([...this.stations, s]);
  }
  updateStation(id: string, patch: Partial<GroundStation>): void {
    this.setStations(this.stations.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)));
  }
  removeStation(id: string): void {
    this.setStations(this.stations.filter((s) => s.id !== id));
  }

  /* ---------- events ---------- */

  logEvent(level: EventLogEntry["level"], type: string, msg: string): void {
    this.events.unshift({ id: "ev-" + ++this.eventSeq, at: Date.now(), level, type, msg });
    if (this.events.length > 300) this.events.pop();
    // Mirror store-level events into the simulator log so they stay visible
    // in the SIMULATED-mode event panel too.
    if (this.mode === "SIMULATED" && this.sim) this.sim.log(level, type, msg);
  }

  /** Passive station look angles (LIVE_READ_ONLY / REPLAY). */
  getStationLooks(): { station: GroundStation; look: ReturnType<CelesTrakOrbitProvider["lookAngles"]>; visible: boolean }[] {
    const when = this.displayNow;
    const provider = this.mode === "REPLAY" ? this.replay : this.liveOrbit;
    return this.stations.map((station) => {
      const look = provider.lookAngles(station, when);
      return {
        station,
        look,
        visible: look !== null && look.elevationDeg >= station.minElevationDeg,
      };
    });
  }
}
