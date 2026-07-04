import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* =====================================================================
   SORA-1 MISSION CONTROL — CubeSat管制ダッシュボード MVP
   ---------------------------------------------------------------------
   単一ファイル実装だが、セクションはそのまま提案ディレクトリ構成
   (src/domain, src/services, src/store, src/components) に分割できる。
   - domain/*   : 純粋な計算・型 (軌道 / テレメトリ / アンテナ / コマンド)
   - services/* : Simulator (60倍速エンジン) / MockSatelliteApi (API境界)
   - store      : useMissionStore (UIはここ経由でのみデータ取得)
   - components : 表示専用コンポーネント群
   実機・上位通信層への接続時は MockSatelliteApi の実装を差し替える。
   ===================================================================== */

/* =====================================================================
   domain/orbit.ts — 簡易軌道モデル (MVP精度)
   ===================================================================== */
const ORBIT_PERIOD = 5580;         // 93分 [s]
const INCLINATION = 51.6;          // [deg]
const EARTH_ROT = 360 / 86400;     // [deg/s]
const ORBIT_LON_RATE = 360 / ORBIT_PERIOD;
const LON0 = -30;
const COMM_RANGE_KM = 2600;        // この距離以内なら通信可能
const R_EARTH = 6371;

const wrapLon = (lon) => ((lon + 540) % 360) - 180;
const d2r = (d) => (d * Math.PI) / 180;
const r2d = (r) => (r * 180) / Math.PI;

function satPosition(t) {
  const phase = (2 * Math.PI * t) / ORBIT_PERIOD;
  const lat = INCLINATION * Math.sin(phase);
  const lon = wrapLon(LON0 + (ORBIT_LON_RATE - EARTH_ROT) * t);
  return { lat, lon };
}

function greatCircleKm(a, b) {
  const dLat = d2r(b.lat - a.lat);
  const dLon = d2r(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(d2r(a.lat)) * Math.cos(d2r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(from, to) {
  const y = Math.sin(d2r(to.lon - from.lon)) * Math.cos(d2r(to.lat));
  const x =
    Math.cos(d2r(from.lat)) * Math.sin(d2r(to.lat)) -
    Math.sin(d2r(from.lat)) * Math.cos(d2r(to.lat)) * Math.cos(d2r(to.lon - from.lon));
  return (r2d(Math.atan2(y, x)) + 360) % 360;
}

const elevationDeg = (dKm) => Math.max(0, 90 * (1 - dKm / COMM_RANGE_KM));

function destPoint(p, brg, dKm) {
  const dl = dKm / R_EARTH, th = d2r(brg);
  const p1 = d2r(p.lat), l1 = d2r(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(th));
  const l2 = l1 + Math.atan2(
    Math.sin(th) * Math.sin(dl) * Math.cos(p1),
    Math.cos(dl) - Math.sin(p1) * Math.sin(p2)
  );
  return { lat: r2d(p2), lon: wrapLon(r2d(l2)) };
}

/* =====================================================================
   domain/antenna.ts — 地上局定義
   ===================================================================== */
const GROUND_STATIONS = [
  { id: "GS1", name: "UCHINOURA", lat: 31.25, lon: 131.08 },
  { id: "GS2", name: "SVALBARD", lat: 78.23, lon: 15.39 },
  { id: "GS3", name: "SANTIAGO", lat: -33.45, lon: -70.67 },
  { id: "GS4", name: "FAIRBANKS", lat: 64.86, lon: -147.85 },
];

/* =====================================================================
   domain/command.ts — コマンド定義
   ===================================================================== */
const COMMANDS = [
  { name: "PING", param: null },
  { name: "RESET_ADCS", param: { label: "AXIS (X/Y/Z)", default: "Z" } },
  { name: "CAPTURE_IMAGE", param: { label: "EXPOSURE [ms]", default: "120" } },
  { name: "START_DOWNLINK", param: { label: "FILE ID", default: "F-002" } },
  { name: "SAFE_MODE", param: null },
];

/* =====================================================================
   domain/telemetry.ts — テレメトリ生成 (時間で自然に変動)
   ===================================================================== */
function genTelemetry(t, inLink, bestEl, storage) {
  const orb = (2 * Math.PI * t) / ORBIT_PERIOD;
  const sun = Math.sin(orb + 0.8);
  const n = (a) => (Math.sin(t * 1.7 + a) + Math.sin(t * 0.31 + a * 2)) * 0.5;
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

/* =====================================================================
   services/simulator.ts — 60倍速シミュレーションエンジン
   ===================================================================== */
const EPOCH = Date.UTC(2026, 6, 4, 0, 0, 0);

function makeInitialFiles() {
  return [
    { id: "F-001", name: "IMG_20260703_PACIFIC.raw", sizeKB: 4200, done: 0, status: "QUEUED" },
    { id: "F-002", name: "IMG_20260704_HONSHU.raw", sizeKB: 5100, done: 0, status: "QUEUED" },
    { id: "F-003", name: "TLM_ARCHIVE_D184.bin", sizeKB: 1800, done: 0, status: "QUEUED" },
    { id: "F-004", name: "ADCS_CALIB_LOG.bin", sizeKB: 640, done: 0, status: "QUEUED" },
  ];
}

class Simulator {
  constructor() { this.reset(); }

  reset() {
    this.simT = 0;
    this.speed = 60;
    this.running = false;
    this.history = [];
    this.logs = [];
    this.commands = [];
    this.files = makeInitialFiles();
    this.activeFile = null;
    this.storage = 34;
    this.antennas = GROUND_STATIONS.map(() => ({ auto: true, manAz: 0, manEl: 0 }));
    this.passes = [];
    this.lastPassCalc = -1e9;
    this.lastHist = -1e9;
    this.prevLink = GROUND_STATIONS.map(() => false);
    this.lastWarn = { batt: -1e9, temp: -1e9 };
    this.cmdSeq = 0;
    this.log("INFO", "SYS", "Simulator initialized. SORA-1 virtual link ready.");
  }

  log(level, type, msg) {
    this.logs.unshift({ t: this.simT, level, type, msg, id: Math.random() });
    if (this.logs.length > 200) this.logs.pop();
  }

  setSpeed(s) { this.speed = s; this.log("INFO", "SIM", "Time factor set to " + s + "x"); }
  start() { if (!this.running) { this.running = true; this.log("INFO", "SIM", "Simulation started"); } }
  pause() { if (this.running) { this.running = false; this.log("INFO", "SIM", "Simulation paused"); } }

  stationGeom(t) {
    const sat = satPosition(t);
    return GROUND_STATIONS.map((gs) => {
      const d = greatCircleKm(gs, sat);
      const inRange = d <= COMM_RANGE_KM;
      return { gs, d, inRange, az: bearingDeg(gs, sat), el: inRange ? elevationDeg(d) : 0 };
    });
  }

  computePasses() {
    const horizon = 8 * 3600, step = 30;
    const passes = [];
    for (let gi = 0; gi < GROUND_STATIONS.length; gi++) {
      const gs = GROUND_STATIONS[gi];
      let open = null;
      if (greatCircleKm(gs, satPosition(this.simT)) <= COMM_RANGE_KM) open = this.simT;
      for (let t = this.simT + step; t <= this.simT + horizon; t += step) {
        const inR = greatCircleKm(gs, satPosition(t)) <= COMM_RANGE_KM;
        if (inR && open === null) open = t;
        if (!inR && open !== null) { passes.push({ gi, aos: open, los: t }); open = null; }
      }
      if (open !== null) passes.push({ gi, aos: open, los: this.simT + horizon });
    }
    passes.sort((a, b) => a.aos - b.aos);
    this.passes = passes;
    this.lastPassCalc = this.simT;
  }

  sendCommand(name, param, inLink) {
    const id = "CMD-" + String(++this.cmdSeq).padStart(3, "0");
    const cmd = { id, name, param, t: this.simT, status: "PENDING" };
    this.commands.unshift(cmd);
    if (this.commands.length > 30) this.commands.pop();
    this.log("INFO", "CMD", id + " " + name + (param ? " [" + param + "]" : "") + " uplinked");
    // 実API接続時はここが非同期応答になる。モックでは0.9秒後に判定。
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
          this.files.forEach((x) => { if (x.status === "ACTIVE") x.status = "QUEUED"; });
          f.status = "ACTIVE";
          this.log("INFO", "DL", "Downlink started: " + f.name);
        } else {
          this.log("WARN", "DL", "File " + param + " not found or already complete");
        }
      }
      if (name === "SAFE_MODE") this.log("WARN", "SYS", "Spacecraft entered SAFE MODE");
      if (name === "RESET_ADCS") this.log("INFO", "ADCS", "ADCS " + param + "-axis reset complete");
    }, 900);
  }

  tick(dtReal) {
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
      this.log("WARN", "EPS", "Battery voltage low: " + tlm.battV + " V"); this.lastWarn.batt = t;
    }
    if (tlm.temp > 26 && t - this.lastWarn.temp > 600) {
      this.log("WARN", "TCS", "Panel temperature high: " + tlm.temp + " degC"); this.lastWarn.temp = t;
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

/* =====================================================================
   services/mockSatelliteApi.ts — API境界 (実機接続時の差し替え点)
   ===================================================================== */
class MockSatelliteApi {
  constructor(sim) { this.sim = sim; }
  start() { this.sim.start(); }
  pause() { this.sim.pause(); }
  reset() { this.sim.reset(); this.sim.computePasses(); this.sim.tick(0); }
  setSpeed(s) { this.sim.setSpeed(s); }
  sendCommand(name, param) {
    this.sim.sendCommand(name, param, this.sim.snapshotCache ? this.sim.snapshotCache.inLink : false);
  }
  setAntenna(i, patch) { Object.assign(this.sim.antennas[i], patch); }
}

/* =====================================================================
   store — useMissionStore
   ===================================================================== */
function useMissionStore() {
  const ref = useRef(null);
  if (!ref.current) {
    const sim = new Simulator();
    sim.computePasses();
    sim.tick(0);
    ref.current = { sim, api: new MockSatelliteApi(sim) };
  }
  const [, setV] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      ref.current.sim.tick(0.25);
      setV((v) => v + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);
  return ref.current;
}

/* =====================================================================
   utils
   ===================================================================== */
const simDate = (t) => new Date(EPOCH + t * 1000);
const p2 = (n) => String(n).padStart(2, "0");
const fmtUTC = (d) => p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds());
const fmtDur = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? h + "h " + p2(m) + "m" : p2(m) + "m " + p2(ss) + "s";
};

/* =====================================================================
   components — デザイントークン
   ===================================================================== */
const C = {
  bg: "#05080f", panel: "#0b1220", panel2: "#0e1729", line: "#1b2a40",
  text: "#c6d4e3", dim: "#5c7089",
  cyan: "#4fd8eb", green: "#3fe089", amber: "#f5b04a", red: "#f4585d", violet: "#8b7bf4",
};
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const LBL = { fontSize: 9, letterSpacing: "0.16em", color: C.dim };

function Panel({ title, right, children, className = "", style = {} }) {
  return (
    <div className={"flex flex-col rounded border overflow-hidden " + className}
      style={{ background: C.panel, borderColor: C.line, ...style }}>
      <div className="flex items-center justify-between shrink-0 border-b"
        style={{ borderColor: C.line, background: C.panel2, padding: "5px 10px" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: C.cyan }}>{title}</span>
        {right}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/* ---------- components/map — 世界地図 + 軌道 ---------- */
const CONTINENTS = [
  [[-168,65],[-155,71],[-130,70],[-110,73],[-85,70],[-75,62],[-60,60],[-55,52],[-65,45],[-70,42],[-75,35],[-81,31],[-81,25],[-90,29],[-97,26],[-97,20],[-92,15],[-83,9],[-79,8],[-85,12],[-95,16],[-105,20],[-110,23],[-115,30],[-122,37],[-124,43],[-124,48],[-135,58],[-152,58],[-165,60]],
  [[-79,8],[-75,10],[-70,12],[-60,10],[-52,5],[-45,-2],[-35,-7],[-38,-15],[-40,-22],[-48,-28],[-53,-34],[-58,-39],[-65,-45],[-68,-52],[-70,-54],[-73,-50],[-72,-40],[-70,-30],[-70,-18],[-76,-14],[-81,-6],[-80,0]],
  [[-17,15],[-16,22],[-10,30],[-6,35],[3,37],[10,37],[20,32],[32,31],[35,28],[43,12],[51,11],[46,2],[41,-2],[40,-10],[35,-20],[32,-29],[25,-34],[18,-34],[15,-28],[12,-18],[13,-8],[9,-1],[9,4],[4,6],[-8,4],[-13,9]],
  [[-10,36],[-9,43],[-2,44],[-5,48],[-1,49],[3,51],[8,54],[8,57],[12,56],[18,55],[21,59],[24,65],[20,69],[28,71],[40,68],[50,69],[68,69],[75,72],[95,76],[110,74],[130,72],[150,70],[170,70],[178,66],[170,60],[162,58],[158,52],[142,54],[135,44],[130,42],[122,39],[122,30],[110,20],[108,12],[104,8],[100,13],[98,8],[95,15],[90,22],[86,20],[80,15],[77,8],[72,20],[66,25],[57,26],[52,28],[48,30],[55,26],[59,23],[57,19],[52,16],[44,12],[43,15],[38,20],[34,28],[32,31],[27,36],[22,36],[12,38],[5,38],[-6,36]],
  [[114,-22],[113,-26],[115,-34],[124,-33],[130,-32],[136,-35],[140,-38],[147,-38],[150,-37],[153,-30],[153,-25],[146,-19],[142,-11],[136,-12],[132,-11],[126,-14],[122,-17]],
  [[-45,60],[-53,66],[-55,70],[-50,75],[-40,77],[-30,82],[-20,80],[-22,74],[-25,70],[-32,66],[-40,62]],
  [[130,31],[132,34],[135,35],[140,36],[141,39],[142,43],[144,44],[141,42],[140,38],[137,35],[133,34]],
];

function WorldMap({ t, geoms, inLink }) {
  const W = 720, H = 360;
  const px = (p) => [((p.lon + 180) / 360) * W, ((90 - p.lat) / 180) * H];
  const sat = satPosition(t);
  const sp = px(sat);

  const trackSegs = useMemo(() => {
    const segs = []; let cur = []; let prev = null;
    for (let dt = 0; dt <= ORBIT_PERIOD * 2; dt += 45) {
      const p = px(satPosition(t + dt));
      if (prev && Math.abs(p[0] - prev[0]) > W / 2) { segs.push(cur); cur = []; }
      cur.push(p); prev = p;
    }
    segs.push(cur);
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(t / 20)]);

  const rangeCircle = (gs) => {
    const segs = []; let cur = []; let prev = null;
    for (let b = 0; b <= 360; b += 12) {
      const p = px(destPoint(gs, b, COMM_RANGE_KM));
      if (prev && Math.abs(p[0] - prev[0]) > W / 2) { segs.push(cur); cur = []; }
      cur.push(p); prev = p;
    }
    segs.push(cur);
    return segs;
  };

  return (
    <svg viewBox={"0 0 " + W + " " + H} className="w-full h-full" preserveAspectRatio="xMidYMid meet"
      style={{ background: "#04070d", display: "block" }}>
      {Array.from({ length: 11 }, (_, i) => (
        <line key={"v" + i} x1={(i + 1) * (W / 12)} y1={0} x2={(i + 1) * (W / 12)} y2={H} stroke="#0f1a2c" strokeWidth="1" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={"h" + i} x1={0} y1={(i + 1) * (H / 6)} x2={W} y2={(i + 1) * (H / 6)} stroke="#0f1a2c" strokeWidth="1" />
      ))}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#16233a" strokeWidth="1.2" />
      {CONTINENTS.map((poly, i) => (
        <polygon key={i} points={poly.map((c) => px({ lon: c[0], lat: c[1] }).join(",")).join(" ")}
          fill="#0d1b2e" stroke="#1e3352" strokeWidth="1" />
      ))}
      {geoms.map((g, i) => {
        const gp = px(g.gs);
        return (
          <g key={i}>
            {rangeCircle(g.gs).map((seg, j) => seg.length > 1 && (
              <polyline key={j} points={seg.map((p) => p.join(",")).join(" ")} fill="none"
                stroke={g.inRange ? C.green : "#2a4a6b"} strokeWidth="1" strokeDasharray="4 3"
                opacity={g.inRange ? 0.9 : 0.55} />
            ))}
            <rect x={gp[0] - 3} y={gp[1] - 3} width="6" height="6"
              fill={g.inRange ? C.green : C.amber} transform={"rotate(45 " + gp[0] + " " + gp[1] + ")"} />
            <text x={gp[0] + 7} y={gp[1] + 3} fontSize="9" fill={C.dim} style={{ fontFamily: MONO }}>{g.gs.name}</text>
          </g>
        );
      })}
      {trackSegs.map((seg, i) => seg.length > 1 && (
        <polyline key={i} points={seg.map((p) => p.join(",")).join(" ")} fill="none"
          stroke={C.cyan} strokeWidth="1.4" opacity="0.65" />
      ))}
      <circle cx={sp[0]} cy={sp[1]} r="10" fill="none" stroke={inLink ? C.green : C.cyan} strokeWidth="1" opacity="0.5">
        <animate attributeName="r" values="6;13;6" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={sp[0]} cy={sp[1]} r="3.4" fill={inLink ? C.green : C.cyan} />
      <text x={sp[0] + 9} y={sp[1] - 7} fontSize="10" fontWeight="bold" fill={C.cyan} style={{ fontFamily: MONO }}>SORA-1</text>
      <text x={sp[0] + 9} y={sp[1] + 4} fontSize="8.5" fill={C.dim} style={{ fontFamily: MONO }}>
        {sat.lat.toFixed(1) + "° " + sat.lon.toFixed(1) + "°"}
      </text>
    </svg>
  );
}

/* ---------- components/antenna — Sky dial + 制御 ---------- */
function SkyDial({ az, el, visible }) {
  const R = 34, cx = 40, cy = 40;
  const r = R * (1 - el / 90);
  const a = d2r(az - 90);
  const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
  return (
    <svg viewBox="0 0 80 80" className="shrink-0" style={{ width: 72, height: 72 }}>
      {[R, R * 0.66, R * 0.33].map((rr, i) => (
        <circle key={i} cx={cx} cy={cy} r={rr} fill="none" stroke="#1c2c45" strokeWidth="1" />
      ))}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#16233a" />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#16233a" />
      <text x={cx} y={7} fontSize="7" fill={C.dim} textAnchor="middle" style={{ fontFamily: MONO }}>N</text>
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={visible ? C.green : C.dim} strokeWidth="1.4" />
      <circle cx={x} cy={y} r="3" fill={visible ? C.green : "#39516f"} />
    </svg>
  );
}

function NumInput({ value, onChange }) {
  return (
    <input type="number" value={value} onChange={onChange}
      className="w-14 rounded outline-none"
      style={{ background: "#050a13", border: "1px solid " + C.line, color: C.amber, fontFamily: MONO, fontSize: 10, padding: "0 4px" }} />
  );
}

function AntennaPanel({ store, geoms }) {
  const { sim, api } = store;
  return (
    <div className="p-2 grid grid-cols-1 gap-2 overflow-y-auto h-full content-start">
      {geoms.map((g, i) => {
        const st = sim.antennas[i];
        const az = st.auto ? g.az : st.manAz;
        const el = st.auto ? g.el : st.manEl;
        return (
          <div key={i} className="flex gap-2 rounded border p-2"
            style={{ borderColor: C.line, background: C.panel2 }}>
            <SkyDial az={az} el={el} visible={g.inRange} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: MONO }}>
                  {g.gs.id} {g.gs.name}
                </span>
                <button onClick={() => api.setAntenna(i, { auto: !st.auto, manAz: Math.round(g.az), manEl: Math.round(g.el) })}
                  className="rounded"
                  style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", padding: "2px 6px",
                    background: st.auto ? "rgba(63,224,137,0.15)" : "#182741",
                    color: st.auto ? C.green : C.dim,
                    border: "1px solid " + (st.auto ? C.green : C.line),
                  }}>
                  AUTO TRACK {st.auto ? "ON" : "OFF"}
                </button>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1" style={{ fontFamily: MONO, fontSize: 10 }}>
                <div><span style={{ color: C.dim }}>AZ </span>
                  {st.auto ? <span style={{ color: C.cyan }}>{az.toFixed(1)}°</span> :
                    <NumInput value={st.manAz} onChange={(e) => api.setAntenna(i, { manAz: +e.target.value })} />}
                </div>
                <div><span style={{ color: C.dim }}>EL </span>
                  {st.auto ? <span style={{ color: C.cyan }}>{el.toFixed(1)}°</span> :
                    <NumInput value={st.manEl} onChange={(e) => api.setAntenna(i, { manEl: +e.target.value })} />}
                </div>
                <div className="col-span-2">
                  <span style={{ color: C.dim }}>RNG </span>
                  <span style={{ color: g.inRange ? C.green : C.dim }}>
                    {Math.round(g.d)} km {g.inRange ? "● TRACKING" : "○ IDLE"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- components/telemetry ---------- */
function TelemetryPanel({ tlm, history }) {
  const cards = [
    { l: "BATT VOLTAGE", v: String(tlm.battV), u: "V", warn: tlm.battV < 7.25 },
    { l: "BATT CURRENT", v: (tlm.battI > 0 ? "+" : "") + tlm.battI, u: "A" },
    { l: "TEMPERATURE", v: String(tlm.temp), u: "°C", warn: tlm.temp > 26 },
    { l: "ATT R/P/Y", v: tlm.roll + "/" + tlm.pitch + "/" + tlm.yaw, u: "°", small: true },
    { l: "DOWNLINK", v: (tlm.downlink / 1000).toFixed(1), u: "kbps" },
    { l: "STORAGE", v: String(tlm.storage), u: "%" },
    { l: "CPU LOAD", v: String(tlm.cpu), u: "%" },
    { l: "SIGNAL", v: tlm.signal <= -140 ? "—" : String(tlm.signal), u: "dBm" },
  ];
  const data = history.map((h) => ({
    x: fmtUTC(simDate(h.t)).slice(0, 5),
    battV: h.battV, temp: h.temp, dl: +(h.downlink / 1000).toFixed(1), sig: h.signal,
  }));
  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-y-auto">
      <div className="grid grid-cols-2 gap-1">
        {cards.map((c) => (
          <div key={c.l} className="rounded border"
            style={{ borderColor: c.warn ? C.amber : C.line, background: C.panel2, padding: "4px 8px" }}>
            <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim }}>{c.l}</div>
            <div style={{ fontSize: c.small ? 12 : 17, color: c.warn ? C.amber : C.text, fontFamily: MONO, fontWeight: 700, lineHeight: 1.3 }}>
              {c.v}<span style={{ fontSize: 9, marginLeft: 4, color: C.dim }}>{c.u}</span>
            </div>
          </div>
        ))}
      </div>
      {[
        { title: "POWER / THERMAL", lines: [["battV", C.green], ["temp", C.amber]] },
        { title: "LINK — RATE / SIGNAL", lines: [["dl", C.cyan], ["sig", C.violet]] },
      ].map((ch) => (
        <div key={ch.title} className="rounded border flex-1"
          style={{ borderColor: C.line, background: C.panel2, minHeight: 110, padding: 4 }}>
          <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim, padding: "2px 4px" }}>{ch.title}</div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -14 }}>
              <XAxis dataKey="x" tick={{ fontSize: 8, fill: C.dim, fontFamily: MONO }}
                interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: C.line }} />
              <YAxis tick={{ fontSize: 8, fill: C.dim, fontFamily: MONO }} tickLine={false}
                axisLine={false} width={44} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#0a1120", border: "1px solid " + C.line, fontSize: 10, fontFamily: MONO }}
                labelStyle={{ color: C.dim }} />
              {ch.lines.map(([k, col]) => (
                <Line key={k} dataKey={k} stroke={col} dot={false} strokeWidth={1.5} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

/* ---------- components/timeline — Pass Schedule ---------- */
function PassTimeline({ t, passes }) {
  const span = 6 * 3600;
  const next = passes.find((p) => p.aos > t);
  const current = passes.find((p) => p.aos <= t && p.los > t);
  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: MONO, fontSize: 10 }}>
        <span><span style={{ color: C.dim }}>NEXT AOS </span>
          <span style={{ color: C.cyan }}>
            {next ? GROUND_STATIONS[next.gi].name + " " + fmtUTC(simDate(next.aos)) + " (T-" + fmtDur(next.aos - t) + ")" : "—"}
          </span></span>
        {current && <span><span style={{ color: C.dim }}>LOS </span>
          <span style={{ color: C.green }}>{fmtUTC(simDate(current.los))} (T-{fmtDur(current.los - t)})</span></span>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-around gap-1">
        {GROUND_STATIONS.map((gs, gi) => (
          <div key={gi} className="flex items-center gap-2">
            <span className="w-20 shrink-0" style={{ color: C.dim, fontFamily: MONO, fontSize: 9 }}>{gs.name}</span>
            <div className="relative flex-1 h-4 overflow-hidden"
              style={{ background: "#070d18", border: "1px solid " + C.line, borderRadius: 2 }}>
              {passes.filter((p) => p.gi === gi && p.los > t && p.aos < t + span).map((p, i) => {
                const l = Math.max(0, ((p.aos - t) / span) * 100);
                const r = Math.min(100, ((p.los - t) / span) * 100);
                const active = p.aos <= t && p.los > t;
                return (
                  <div key={i} className="absolute top-0 bottom-0"
                    title={"AOS " + fmtUTC(simDate(p.aos)) + " / LOS " + fmtUTC(simDate(p.los))}
                    style={{
                      left: l + "%", width: Math.max(0.6, r - l) + "%", borderRadius: 2,
                      background: active ? "rgba(63,224,137,0.55)" : "rgba(79,216,235,0.3)",
                      border: "1px solid " + (active ? C.green : C.cyan),
                    }} />
                );
              })}
              <div className="absolute top-0 bottom-0 w-px" style={{ left: 0, background: C.red }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between" style={{ color: C.dim, fontFamily: MONO, fontSize: 8 }}>
        <span>NOW</span><span>+1h</span><span>+2h</span><span>+3h</span><span>+4h</span><span>+5h</span><span>+6h</span>
      </div>
    </div>
  );
}

/* ---------- components/command ---------- */
function CommandPanel({ store, inLink }) {
  const { sim, api } = store;
  const [cmd, setCmd] = useState(COMMANDS[0].name);
  const [param, setParam] = useState("");
  const def = COMMANDS.find((c) => c.name === cmd);
  useEffect(() => { setParam(def && def.param ? def.param.default : ""); }, [cmd]); // eslint-disable-line
  const statusColor = { PENDING: C.amber, SUCCESS: C.green, FAILED: C.red };
  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>COMMAND</span>
          <select value={cmd} onChange={(e) => setCmd(e.target.value)}
            className="rounded outline-none"
            style={{ background: "#050a13", border: "1px solid " + C.line, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 8px" }}>
            {COMMANDS.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>
        {def && def.param && (
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span style={LBL}>{def.param.label}</span>
            <input value={param} onChange={(e) => setParam(e.target.value)}
              className="rounded w-28 outline-none"
              style={{ background: "#050a13", border: "1px solid " + C.line, color: C.amber, fontFamily: MONO, fontSize: 11, padding: "4px 8px" }} />
          </div>
        )}
        <button onClick={() => api.sendCommand(cmd, def && def.param ? param : null)}
          className="rounded"
          style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", padding: "5px 16px",
            background: inLink ? "rgba(63,224,137,0.18)" : "rgba(244,88,93,0.12)",
            color: inLink ? C.green : C.red,
            border: "1px solid " + (inLink ? C.green : C.red),
          }}>
          SEND {inLink ? "▲" : "⊘"}
        </button>
        {!inLink && <span style={{ fontSize: 9, color: C.red, fontFamily: MONO }}>NO LINK — uplink will fail</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded border"
        style={{ borderColor: C.line, background: "#070d18" }}>
        <table className="w-full" style={{ fontFamily: MONO, fontSize: 10 }}>
          <thead className="sticky top-0" style={{ background: C.panel2 }}>
            <tr style={{ color: C.dim }}>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>ID</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>T (SIM)</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>COMMAND</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>PARAM</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {sim.commands.length === 0 && (
              <tr><td colSpan={5} className="text-center" style={{ color: C.dim, padding: "12px 8px" }}>
                No commands sent. Select a command and press SEND during a pass.
              </td></tr>
            )}
            {sim.commands.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid " + C.line, color: C.text }}>
                <td style={{ padding: "3px 8px", color: C.cyan }}>{c.id}</td>
                <td style={{ padding: "3px 8px" }}>{fmtUTC(simDate(c.t))}</td>
                <td style={{ padding: "3px 8px" }}>{c.name}</td>
                <td style={{ padding: "3px 8px", color: C.amber }}>{c.param || "—"}</td>
                <td style={{ padding: "3px 8px", fontWeight: 700, color: statusColor[c.status] }}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- components/logs ---------- */
function EventLog({ logs }) {
  const col = { INFO: C.cyan, WARN: C.amber, ERROR: C.red };
  return (
    <div className="h-full overflow-y-auto" style={{ fontFamily: MONO, padding: "4px 8px" }}>
      {logs.map((l) => (
        <div key={l.id} className="flex gap-2 border-b"
          style={{ borderColor: "#0e1728", fontSize: 10, padding: "3px 0" }}>
          <span className="shrink-0" style={{ color: C.dim }}>{fmtUTC(simDate(l.t))}</span>
          <span className="w-11 shrink-0" style={{ color: col[l.level], fontWeight: 700 }}>{l.level}</span>
          <span className="w-14 shrink-0" style={{ color: C.dim }}>{l.type}</span>
          <span style={{ color: C.text }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- components/downlink ---------- */
function DownlinkPanel({ files }) {
  const sc = { QUEUED: C.dim, ACTIVE: C.cyan, COMPLETE: C.green };
  return (
    <div className="p-2 h-full flex flex-col gap-1 overflow-y-auto" style={{ fontFamily: MONO }}>
      {files.map((f) => {
        const pct = (f.done / f.sizeKB) * 100;
        return (
          <div key={f.id} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "4px 8px" }}>
            <div className="flex justify-between" style={{ fontSize: 10 }}>
              <span style={{ color: C.text }}><span style={{ color: C.cyan }}>{f.id}</span> {f.name}</span>
              <span style={{ color: sc[f.status], fontWeight: 700 }}>{f.status}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 overflow-hidden" style={{ height: 5, borderRadius: 99, background: "#050a13" }}>
                <div style={{
                  height: "100%", borderRadius: 99, width: pct + "%",
                  background: f.status === "COMPLETE" ? C.green : C.cyan, transition: "width 0.25s linear",
                }} />
              </div>
              <span className="w-24 text-right" style={{ fontSize: 9, color: C.dim }}>
                {Math.round(f.done)}/{f.sizeKB} KB
              </span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
        Send START_DOWNLINK with a FILE ID during a pass to begin transfer.
      </div>
    </div>
  );
}

/* ---------- components/layout — Top bar ---------- */
function TopBar({ store, snap }) {
  const { sim, api } = store;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const Btn = ({ label, onClick, active, color = C.cyan }) => (
    <button onClick={onClick} className="rounded"
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", padding: "4px 10px",
        background: active ? color + "22" : "#0e1729",
        color: active ? color : C.dim,
        border: "1px solid " + (active ? color : C.line),
      }}>{label}</button>
  );
  const sd = simDate(snap.t);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b"
      style={{ background: "#080e19", borderColor: C.line, padding: "8px 12px" }}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.22em", color: C.text }}>SORA-1</span>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", color: C.dim }}>CUBESAT MISSION CONTROL · SIM</span>
      </div>
      <div className="flex gap-4" style={{ fontFamily: MONO, fontSize: 10 }}>
        <span><span style={{ color: C.dim }}>UTC </span><span style={{ color: C.text }}>{fmtUTC(now)}</span></span>
        <span><span style={{ color: C.dim }}>SIM </span>
          <span style={{ color: C.cyan }}>{sd.toISOString().slice(5, 10)} {fmtUTC(sd)}</span></span>
        <span><span style={{ color: C.dim }}>RATE </span><span style={{ color: C.amber }}>×{sim.speed}</span></span>
      </div>
      <div className="flex gap-1">
        <Btn label={sim.running ? "RUNNING" : "START"} active={sim.running} color={C.green} onClick={() => api.start()} />
        <Btn label="PAUSE" active={!sim.running} color={C.amber} onClick={() => api.pause()} />
        <Btn label="RESET" color={C.red} onClick={() => api.reset()} />
      </div>
      <div className="flex gap-1">
        {[1, 10, 60, 120].map((s) => (
          <Btn key={s} label={s + "x"} active={sim.speed === s} onClick={() => api.setSpeed(s)} />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {snap.inLink && <span className="animate-ping absolute inline-flex h-full w-full rounded-full"
            style={{ background: C.green, opacity: 0.6 }} />}
          <span className="relative inline-flex rounded-full h-2.5 w-2.5"
            style={{ background: snap.inLink ? C.green : C.red }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", fontFamily: MONO, color: snap.inLink ? C.green : C.red }}>
          {snap.inLink ? "IN LINK" : "NO LINK"}
        </span>
      </div>
    </div>
  );
}

/* =====================================================================
   app — レイアウト組み立て
   ===================================================================== */
export default function App() {
  const store = useMissionStore();
  const { sim } = store;
  const snap = sim.snapshotCache;

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: C.bg, color: C.text }}>
      <TopBar store={store} snap={snap} />
      <div className="grid gap-2 p-2 grid-cols-1 lg:grid-cols-12">
        <Panel title="ORBIT / GROUND TRACK" className="lg:col-span-5" style={{ height: 400 }}
          right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>EQUIRECT · TRACK +2 REV</span>}>
          <WorldMap t={snap.t} geoms={snap.geoms} inLink={snap.inLink} />
        </Panel>
        <Panel title="ANTENNA CONTROL — 4 STATIONS" className="lg:col-span-4" style={{ height: 400 }}>
          <AntennaPanel store={store} geoms={snap.geoms} />
        </Panel>
        <Panel title="TELEMETRY" className="lg:col-span-3" style={{ height: 400 }}>
          <TelemetryPanel tlm={snap.tlm} history={sim.history} />
        </Panel>
        <div className="lg:col-span-5 grid grid-rows-2 gap-2" style={{ height: 440 }}>
          <Panel title="PASS SCHEDULE — NEXT 6H">
            <PassTimeline t={snap.t} passes={sim.passes} />
          </Panel>
          <Panel title="DOWNLINK / FILE TRANSFER">
            <DownlinkPanel files={sim.files} />
          </Panel>
        </div>
        <Panel title="COMMAND CONSOLE" className="lg:col-span-4" style={{ height: 440 }}>
          <CommandPanel store={store} inLink={snap.inLink} />
        </Panel>
        <Panel title="EVENT LOG" className="lg:col-span-3" style={{ height: 440 }}
          right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>{sim.logs.length} EVENTS</span>}>
          <EventLog logs={sim.logs} />
        </Panel>
      </div>
      <div className="border-t" style={{ color: C.dim, borderColor: C.line, fontSize: 8.5, letterSpacing: "0.12em", padding: "4px 12px" }}>
        VIRTUAL SATELLITE · SIMPLIFIED ORBIT MODEL · MOCK API LAYER (services/mockSatelliteApi) — REPLACE FOR FLIGHT OPS
      </div>
    </div>
  );
}
