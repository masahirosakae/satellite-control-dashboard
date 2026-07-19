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
  ProviderRequestState,
  RehearsalMode,
  SatelliteProfile,
  TelemetrySnapshot,
} from "../domain/types";
import { advanceRehearsal, assertNotTransmitted, createCommandRehearsal } from "../domain/commandRehearsal";
import { mergeNetWindows, type NetWindow, type PassInterval } from "../domain/netWindow";
import { contactPhaseAt, type ContactPhaseInfo } from "../domain/contactPhase";
import { reconcileAcks, type Advisory } from "../domain/advisory";
import { deriveOperationalAssessment, type OperationalSnapshot } from "../domain/operationalAssessment";
import type { ChecklistItem } from "../domain/opsChecklist";
import { Simulator, simDate } from "../services/simulator/Simulator";
import { MissionApi } from "../services/api/missionApi";
import { SimulatorProvider } from "../services/providers/SimulatorProvider";
import { CelesTrakOrbitProvider } from "../services/providers/CelesTrakOrbitProvider";
import { SatNogsObservationProvider } from "../services/providers/SatNogsObservationProvider";
import { SatNogsTelemetryProvider } from "../services/providers/SatNogsTelemetryProvider";
import { ReplayProvider, type ReplayFixture } from "../services/providers/ReplayProvider";
import { loadStations, saveStations } from "./groundStations";
import replayFixtureJson from "../fixtures/sonate2-replay.json";
import { parseControlPlaneMode } from "../services/control/ControlPlane";
import type { ControlPlanePort } from "../services/control/ControlPlane";
import { DisabledControlPlaneAdapter } from "../services/control/DisabledControlPlane";

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

  events: EventLogEntry[] = [];
  version = 0;

  private rehearsalHistories: Record<RehearsalMode, CommandRehearsal[]> = {
    LIVE_READ_ONLY: [],
    REPLAY: [],
  };
  private rehearsalSeq = 0;
  private eventSeq = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastOrbitRefresh = 0;
  private lastSatnogsRefresh = 0;
  private refreshing = false;
  private ackedAdvisoryIds = new Set<string>();
  private rehearsalRolls = new Map<string, number>();

  /**
   * Control Plane boundary — see src/services/control/ControlPlane.ts.
   * v0.2.0 ships exactly one adapter (DisabledControlPlaneAdapter); the
   * store never constructs anything else, regardless of controlPlaneModeRaw.
   */
  readonly controlPlane: ControlPlanePort = new DisabledControlPlaneAdapter();

  constructor(private api: MissionApi = new MissionApi(), controlPlaneModeRaw?: string) {
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
    const parsed = parseControlPlaneMode(controlPlaneModeRaw);
    if (parsed.unrecognizedValue !== null) {
      this.logEvent(
        "WARN",
        "CTRL",
        `control plane mode "${parsed.unrecognizedValue}" not recognized — falling back to DISABLED`
      );
    }
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
    this.tickRehearsals();
    this.ackedAdvisoryIds = reconcileAcks(this.ackedAdvisoryIds, this.computeAdvisories().map((a) => a.id));
    this.notify();
  }

  /**
   * Advance the rehearsal lifecycle (CREATED -> REHEARSAL_ACK ->
   * REHEARSAL_EXEC | REHEARSAL_FAIL) for every non-terminal rehearsal in
   * BOTH mode histories, driven purely by wall-clock elapsed time — runs
   * regardless of the current mode, since rehearsals are wall-clock
   * artifacts independent of the mission clock. Only the timer (tick())
   * drives this; there is no other trigger.
   */
  private tickRehearsals(): void {
    const nowMs = Date.now();
    for (const mode of Object.keys(this.rehearsalHistories) as RehearsalMode[]) {
      const history = this.rehearsalHistories[mode];
      if (history.length === 0) continue;
      this.rehearsalHistories[mode] = history.map((r) => {
        if (r.status !== "CREATED" && r.status !== "REHEARSAL_ACK") return r;
        const elapsedMs = nowMs - Date.parse(r.createdAtWallClock);
        const roll = this.rehearsalRolls.get(r.id) ?? 0;
        const advance = advanceRehearsal(r.status, elapsedMs, roll, r.id, r.createdInMode, r.contextTimestamp);
        if (!advance) return r;
        // Only the LAST message (the one reflecting the final resulting
        // status) is WARN when that status is REHEARSAL_FAIL. Any earlier
        // message in the same call (e.g. the intermediate ACK, when a
        // CREATED rehearsal jumps straight to terminal in one tick) is
        // always INFO — it never itself represents a failure.
        const lastIndex = advance.logMessages.length - 1;
        advance.logMessages.forEach((msg, i) => {
          const level = i === lastIndex && advance.status === "REHEARSAL_FAIL" ? "WARN" : "INFO";
          this.logEvent(level, "RHRSL", msg);
        });
        return Object.freeze({ ...r, status: advance.status, failReason: advance.failReason });
      });
    }
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

  getNetWindows(): NetWindow[] {
    const passes: PassInterval[] = this.getPassPredictions().map((p) => ({
      stationId: p.stationId,
      aosMs: Date.parse(p.aos),
      losMs: Date.parse(p.los),
    }));
    return mergeNetWindows(passes);
  }

  getContactPhase(): ContactPhaseInfo {
    return contactPhaseAt(this.displayNow.getTime(), this.getNetWindows());
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

  /**
   * Pure assembly of the current OperationalSnapshot — no state mutation.
   * Every field is assembled ONCE here so advisories and the ops checklist
   * (both derived from this same object via deriveOperationalAssessment)
   * can never observe different underlying request/health state.
   */
  private buildOperationalSnapshot(): OperationalSnapshot {
    const orbitRequest: ProviderRequestState =
      this.mode === "LIVE_READ_ONLY"
        ? this.liveOrbit.getProviderHealth()[0]?.requestState ?? "NOT_REQUESTED"
        : "SUCCEEDED";
    const tlmRequest: ProviderRequestState =
      this.mode === "LIVE_READ_ONLY" ? this.liveTlm.getProviderHealth().requestState : "SUCCEEDED";
    return {
      mode: this.mode,
      orbit: this.getOrbitState(),
      orbitRequest,
      telemetry: this.getTelemetry(),
      tlmRequest,
      health: this.getProviderHealth(),
      stations: this.stations,
      phase: this.getContactPhase(),
    };
  }

  /** Pure assembly of the current advisory set — no state mutation. */
  private computeAdvisories(): Advisory[] {
    return deriveOperationalAssessment(this.buildOperationalSnapshot()).advisories;
  }

  /** Read-only: does not mutate ack state (reconciliation happens in tick()). */
  getAdvisories(): { active: Advisory[]; acked: Advisory[] } {
    return this.getOperationalAssessment().advisories;
  }

  /**
   * Advisories (partitioned by ack state, read-only) and the ops checklist,
   * both derived from a single OperationalSnapshot so they stay consistent
   * with each other. Does not mutate ack state — reconciliation happens
   * only in tick().
   */
  getOperationalAssessment(): { advisories: { active: Advisory[]; acked: Advisory[] }; checklist: ChecklistItem[] } {
    const { advisories, checklist } = deriveOperationalAssessment(this.buildOperationalSnapshot());
    const active = advisories.filter((a) => !this.ackedAdvisoryIds.has(a.id));
    const acked = advisories.filter((a) => this.ackedAdvisoryIds.has(a.id));
    return { advisories: { active, acked }, checklist };
  }

  ackAdvisory(id: string): void {
    const currentIds = new Set(this.computeAdvisories().map((a) => a.id));
    if (!currentIds.has(id)) return;
    this.ackedAdvisoryIds.add(id);
    this.logEvent("INFO", "ADVSY", "advisory acknowledged: " + id);
    this.notify();
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
   * SIMULATED mode does not use rehearsal — it has its own virtual
   * simulator console (sendSimCommand), a completely separate code path.
   */
  createRehearsal(name: string, param: string | null): CommandRehearsal | null {
    if (this.mode === "SIMULATED") {
      this.logEvent(
        "WARN",
        "RHRSL",
        "rehearsal rejected — SIMULATED mode uses the virtual simulator console, not command rehearsal"
      );
      return null;
    }
    const mode: RehearsalMode = this.mode;
    const wallNow = new Date();
    const contextNow = this.displayNow;
    const { rehearsal, logMessage } = createCommandRehearsal(
      ++this.rehearsalSeq,
      name,
      param,
      mode,
      wallNow,
      contextNow
    );
    assertNotTransmitted(rehearsal);
    this.rehearsalRolls.set(rehearsal.id, Math.random());
    const history = this.rehearsalHistories[mode];
    history.unshift(rehearsal);
    if (history.length > 50) {
      const dropped = history.pop();
      if (dropped) this.rehearsalRolls.delete(dropped.id);
    }
    this.logEvent("INFO", "RHRSL", "rehearsal command created — " + logMessage);
    this.notify();
    return rehearsal;
  }

  /** Rehearsal history for the CURRENT mode only (empty in SIMULATED). */
  getRehearsals(): readonly CommandRehearsal[] {
    if (this.mode === "SIMULATED") return Object.freeze([]);
    return Object.freeze([...this.rehearsalHistories[this.mode]]);
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
