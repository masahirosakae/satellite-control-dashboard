/**
 * services/simulator — 60x virtual mission engine (SIMULATED mode only).
 * Ported from the original single-file MVP; uses the simplified sine-wave
 * orbit model, a virtual link budget and generated telemetry.
 */
import {
  simSatPosition,
  simElevationDeg,
  SIM_COMM_RANGE_KM,
  SIM_ORBIT_PERIOD_S,
} from "../../domain/simpleOrbit";
import { greatCircleKm, bearingDeg } from "../../domain/geo";
import type { GroundStation, SatelliteMode } from "../../domain/types";

export const SIM_EPOCH_MS = Date.UTC(2026, 6, 4, 0, 0, 0);

export interface SimLogEntry {
  t: number;
  level: "INFO" | "WARN" | "ERROR";
  type: string;
  msg: string;
  id: number;
}

export interface SimCommand {
  id: string;
  name: string;
  param: string | null;
  t: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
}

export interface SimFile {
  id: string;
  name: string;
  sizeKB: number;
  done: number;
  status: "QUEUED" | "ACTIVE" | "COMPLETE";
}

export interface SimStationGeom {
  gs: GroundStation;
  d: number;
  inRange: boolean;
  az: number;
  el: number;
}

export interface SimPass {
  stationId: string;
  aos: number; // sim seconds
  los: number;
}

export interface SimTelemetry {
  battV: number;
  battI: number;
  temp: number;
  roll: number;
  pitch: number;
  yaw: number;
  downlink: number;
  storage: number;
  cpu: number;
  signal: number;
}

export interface SimSnapshot {
  t: number;
  geoms: SimStationGeom[];
  inLink: boolean;
  bestEl: number;
  tlm: SimTelemetry;
}

export interface AntennaState {
  auto: boolean;
  manAz: number;
  manEl: number;
}

function genTelemetry(t: number, inLink: boolean, bestEl: number, storage: number): SimTelemetry {
  const orb = (2 * Math.PI * t) / SIM_ORBIT_PERIOD_S;
  const sun = Math.sin(orb + 0.8);
  const n = (a: number) => (Math.sin(t * 1.7 + a) + Math.sin(t * 0.31 + a * 2)) * 0.5;
  return {
    battV: +(7.55 + 0.45 * sun + 0.03 * n(1)).toFixed(2),
    battI: +((sun > 0 ? 0.62 * sun : -0.38) + 0.02 * n(2)).toFixed(2),
    temp: +(11 + 16 * sun + 0.4 * n(3)).toFixed(1),
    roll: +(3.2 * Math.sin(t / 210) + 0.3 * n(4)).toFixed(1),
    pitch: +(2.1 * Math.sin(t / 145 + 1) + 0.3 * n(5)).toFixed(1),
    yaw: +(4.5 * Math.sin(t / 320 + 2) + 0.3 * n(6)).toFixed(1),
    downlink: inLink ? Math.round(2400 + 7200 * (bestEl / 90)) : 0,
    storage: +storage.toFixed(1),
    cpu: +(24 + 9 * Math.abs(n(7)) + (inLink ? 14 : 0)).toFixed(0),
    signal: inLink ? +(-118 + 46 * (bestEl / 90) + n(8)).toFixed(1) : -140,
  };
}

function makeInitialFiles(): SimFile[] {
  return [
    { id: "F-001", name: "IMG_20260703_PACIFIC.raw", sizeKB: 4200, done: 0, status: "QUEUED" },
    { id: "F-002", name: "IMG_20260704_HONSHU.raw", sizeKB: 5100, done: 0, status: "QUEUED" },
    { id: "F-003", name: "TLM_ARCHIVE_D184.bin", sizeKB: 1800, done: 0, status: "QUEUED" },
    { id: "F-004", name: "ADCS_CALIB_LOG.bin", sizeKB: 640, done: 0, status: "QUEUED" },
  ];
}

export class Simulator {
  simT = 0;
  speed = 60;
  running = false;
  history: ({ t: number } & SimTelemetry)[] = [];
  logs: SimLogEntry[] = [];
  commands: SimCommand[] = [];
  files: SimFile[] = [];
  activeFile: string | null = null;
  storage = 34;
  stations: GroundStation[] = [];
  antennas: AntennaState[] = [];
  passes: SimPass[] = [];
  satelliteMode: SatelliteMode = "NOMINAL";
  snapshotCache: SimSnapshot;

  private lastPassCalc = -1e9;
  private lastHist = -1e9;
  private prevLink: boolean[] = [];
  private lastWarn = { batt: -1e9, temp: -1e9 };
  private cmdSeq = 0;
  private logSeq = 0;

  constructor(stations: GroundStation[]) {
    this.snapshotCache = { t: 0, geoms: [], inLink: false, bestEl: 0, tlm: genTelemetry(0, false, 0, 34) };
    this.reset(stations);
  }

  reset(stations?: GroundStation[]): void {
    if (stations) this.stations = stations;
    this.simT = 0;
    this.speed = 60;
    this.running = false;
    this.history = [];
    this.logs = [];
    this.commands = [];
    this.files = makeInitialFiles();
    this.activeFile = null;
    this.storage = 34;
    this.satelliteMode = "NOMINAL";
    this.antennas = this.stations.map(() => ({ auto: true, manAz: 0, manEl: 0 }));
    this.passes = [];
    this.lastPassCalc = -1e9;
    this.lastHist = -1e9;
    this.prevLink = this.stations.map(() => false);
    this.lastWarn = { batt: -1e9, temp: -1e9 };
    this.cmdSeq = 0;
    this.log("INFO", "SYS", "Simulator initialized. SORA-1 virtual link ready.");
    this.computePasses();
    this.tick(0);
  }

  setStations(stations: GroundStation[]): void {
    this.stations = stations;
    this.antennas = stations.map(() => ({ auto: true, manAz: 0, manEl: 0 }));
    this.prevLink = stations.map(() => false);
    this.computePasses();
    this.tick(0);
  }

  log(level: SimLogEntry["level"], type: string, msg: string): void {
    this.logs.unshift({ t: this.simT, level, type, msg, id: ++this.logSeq });
    if (this.logs.length > 200) this.logs.pop();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.log("INFO", "SIM", "Time factor set to " + s + "x");
  }
  start(): void {
    if (!this.running) {
      this.running = true;
      this.log("INFO", "SIM", "Simulation started");
    }
  }
  pause(): void {
    if (this.running) {
      this.running = false;
      this.log("INFO", "SIM", "Simulation paused");
    }
  }

  stationGeom(t: number): SimStationGeom[] {
    const sat = simSatPosition(t);
    return this.stations.map((gs) => {
      const d = greatCircleKm(gs, sat);
      const inRange = d <= SIM_COMM_RANGE_KM;
      return { gs, d, inRange, az: bearingDeg(gs, sat), el: inRange ? simElevationDeg(d) : 0 };
    });
  }

  computePasses(): void {
    const horizon = 24 * 3600;
    const step = 30;
    const passes: SimPass[] = [];
    for (const gs of this.stations) {
      let open: number | null = null;
      if (greatCircleKm(gs, simSatPosition(this.simT)) <= SIM_COMM_RANGE_KM) open = this.simT;
      for (let t = this.simT + step; t <= this.simT + horizon; t += step) {
        const inR = greatCircleKm(gs, simSatPosition(t)) <= SIM_COMM_RANGE_KM;
        if (inR && open === null) open = t;
        if (!inR && open !== null) {
          passes.push({ stationId: gs.id, aos: open, los: t });
          open = null;
        }
      }
      if (open !== null) passes.push({ stationId: gs.id, aos: open, los: this.simT + horizon });
    }
    passes.sort((a, b) => a.aos - b.aos);
    this.passes = passes;
    this.lastPassCalc = this.simT;
  }

  /**
   * Send a command to the VIRTUAL satellite. Only exists in SIMULATED mode —
   * the mock ACK below is a setTimeout, not a network call.
   */
  sendCommand(name: string, param: string | null, inLink: boolean): void {
    const id = "CMD-" + String(++this.cmdSeq).padStart(3, "0");
    const cmd: SimCommand = { id, name, param, t: this.simT, status: "PENDING" };
    this.commands.unshift(cmd);
    if (this.commands.length > 30) this.commands.pop();
    this.log("INFO", "CMD", id + " " + name + (param ? " [" + param + "]" : "") + " uplinked (VIRTUAL)");
    setTimeout(() => {
      if (!inLink) {
        cmd.status = "FAILED";
        this.log("ERROR", "CMD", id + " " + name + " failed — NO LINK");
        return;
      }
      cmd.status = "SUCCESS";
      this.log("INFO", "CMD", id + " " + name + " ACK received");
      if (name === "CAPTURE_IMAGE") {
        this.storage = Math.min(100, this.storage + 2.4);
        this.log("INFO", "PAYLOAD", "Image captured, stored to flash");
      }
      if (name === "START_DOWNLINK") {
        const f = this.files.find((x) => x.id === param);
        if (f && f.status !== "COMPLETE") {
          this.activeFile = f.id;
          this.files.forEach((x) => {
            if (x.status === "ACTIVE") x.status = "QUEUED";
          });
          f.status = "ACTIVE";
          this.log("INFO", "DL", "Downlink started: " + f.name);
        } else {
          this.log("WARN", "DL", "File " + param + " not found or already complete");
        }
      }
      if (name === "SAFE_MODE") {
        this.satelliteMode = "SAFE";
        this.log("WARN", "SYS", "Spacecraft entered SAFE MODE");
      }
      if (name === "RESET_ADCS") this.log("INFO", "ADCS", "ADCS " + param + "-axis reset complete");
    }, 900);
  }

  tick(dtReal: number): void {
    if (this.running) this.simT += dtReal * this.speed;
    const t = this.simT;
    const geoms = this.stationGeom(t);
    const linked = geoms.filter((g) => g.inRange);
    const inLink = linked.length > 0;
    const bestEl = linked.reduce((m, g) => Math.max(m, g.el), 0);

    geoms.forEach((g, i) => {
      if (g.inRange && !this.prevLink[i]) this.log("INFO", "PASS", "AOS " + g.gs.name + " — acquisition of signal");
      if (!g.inRange && this.prevLink[i]) this.log("INFO", "PASS", "LOS " + g.gs.name + " — loss of signal");
      this.prevLink[i] = g.inRange;
    });

    const tlm = genTelemetry(t, inLink, bestEl, this.storage);

    if (this.running && this.activeFile && inLink) {
      const f = this.files.find((x) => x.id === this.activeFile);
      if (f) {
        f.done = Math.min(f.sizeKB, f.done + (tlm.downlink / 8 / 1000) * dtReal * this.speed * 6);
        this.storage = Math.max(5, this.storage - 0.002 * dtReal * this.speed);
        if (f.done >= f.sizeKB) {
          f.status = "COMPLETE";
          this.activeFile = null;
          this.log("INFO", "DL", "Downlink complete: " + f.name);
        }
      }
    }

    if (tlm.battV < 7.25 && t - this.lastWarn.batt > 600) {
      this.log("WARN", "EPS", "Battery voltage low: " + tlm.battV + " V");
      this.lastWarn.batt = t;
    }
    if (tlm.temp > 26 && t - this.lastWarn.temp > 600) {
      this.log("WARN", "TCS", "Panel temperature high: " + tlm.temp + " degC");
      this.lastWarn.temp = t;
    }

    if (t - this.lastHist >= 30) {
      this.history.push({ t, ...tlm });
      if (this.history.length > 160) this.history.shift();
      this.lastHist = t;
    }

    if (t - this.lastPassCalc > 300) this.computePasses();

    this.snapshotCache = { t, geoms, inLink, bestEl, tlm };
  }
}

export const simDate = (t: number): Date => new Date(SIM_EPOCH_MS + t * 1000);
