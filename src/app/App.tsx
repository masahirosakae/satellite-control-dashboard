import { C, MONO, fmtUTC, fmtIso } from "../components/layout/theme";
import { Panel } from "../components/layout/Panel";
import { TopBar } from "../components/layout/TopBar";
import { WorldMap, type MapStation } from "../components/map/WorldMap";
import { AntennaPanel } from "../components/antenna/AntennaPanel";
import { StationVisibilityPanel } from "../components/antenna/StationVisibilityPanel";
import { TelemetryPanel } from "../components/telemetry/TelemetryPanel";
import { LiveTelemetryPanel } from "../components/telemetry/LiveTelemetryPanel";
import { PassTimeline, type TimelinePass } from "../components/pass/PassTimeline";
import { CommandPanel } from "../components/command/CommandPanel";
import { RehearsalConsole } from "../components/command/RehearsalConsole";
import { EventLog, type DisplayLogEntry } from "../components/logs/EventLog";
import { DownlinkPanel } from "../components/mission/DownlinkPanel";
import { ObservationBrowser } from "../components/mission/ObservationBrowser";
import { ProviderHealthPanel } from "../components/mission/ProviderHealthPanel";
import { GroundStationEditor } from "../components/mission/GroundStationEditor";
import { OperationsChecklist } from "../components/mission/OperationsChecklist";
import { AdvisoryPanel } from "../components/mission/AdvisoryPanel";
import { SIM_COMM_RANGE_KM } from "../domain/simpleOrbit";
import { buildOpsChecklist } from "../domain/opsChecklist";
import { simDate } from "../services/simulator/Simulator";
import { useMissionStore } from "../store/useMissionStore";

export default function App() {
  const store = useMissionStore();
  const mode = store.mode;
  const isSim = mode === "SIMULATED";

  const orbit = store.getOrbitState();
  const telemetry = store.getTelemetry();
  const observations = store.getObservations();
  const passes = store.getPassPredictions();
  const health = store.getProviderHealth();
  const nowMs = store.displayNow.getTime();
  const netWindows = store.getNetWindows();
  const contactPhase = store.getContactPhase();
  const advisories = store.getAdvisories();
  const checklist = buildOpsChecklist({
    orbit,
    telemetry,
    health,
    stations: store.stations,
    phase: contactPhase,
  });

  const { trackPast, trackFuture } = (() => {
    const { track, trackStartMs, trackStepS } = orbit;
    if (trackStartMs === null || trackStepS === null || track.length === 0) {
      return { trackPast: [], trackFuture: [] };
    }
    // Last sample at or before now; the two slices share that boundary
    // point so the past/future polylines connect with no visible gap.
    const idx = Math.floor((nowMs - trackStartMs) / (trackStepS * 1000));
    const pastEnd = Math.max(0, Math.min(track.length, idx + 1));
    const trackPast = track.slice(0, pastEnd);
    const trackFuture = track.slice(Math.max(0, pastEnd - 1));
    return { trackPast, trackFuture };
  })();
  const snap = store.sim.snapshotCache;
  const looks = isSim ? [] : store.getStationLooks();
  const visibleCount = looks.filter((l) => l.visible).length;

  const linkOn = isSim ? snap.inLink : visibleCount > 0;
  const linkLabel = isSim
    ? snap.inLink
      ? "IN LINK"
      : "NO LINK"
    : visibleCount > 0
      ? `VISIBLE (${visibleCount} GS)`
      : "NOT VISIBLE";

  const mapStations: MapStation[] = isSim
    ? snap.geoms.map((g) => ({
        id: g.gs.id,
        name: g.gs.name,
        lat: g.gs.lat,
        lon: g.gs.lon,
        active: g.inRange,
        rangeKm: SIM_COMM_RANGE_KM,
      }))
    : looks.map((l) => ({
        id: l.station.id,
        name: l.station.name,
        lat: l.station.lat,
        lon: l.station.lon,
        active: l.visible,
      }));

  const timelinePasses: TimelinePass[] = passes.map((p) => ({
    stationId: p.stationId,
    aosMs: Date.parse(p.aos),
    losMs: Date.parse(p.los),
    maxElevationDeg: isSim ? null : p.maxElevationDeg,
    aosAzimuthDeg: isSim ? null : p.aosAzimuthDeg,
    losAzimuthDeg: isSim ? null : p.losAzimuthDeg,
  }));

  const logEntries: DisplayLogEntry[] = isSim
    ? store.sim.logs.map((l) => ({
        id: "sim-" + l.id,
        time: fmtUTC(simDate(l.t)),
        level: l.level,
        type: l.type,
        msg: l.msg,
      }))
    : store.events.map((e) => ({
        id: e.id,
        time: fmtUTC(new Date(e.at)),
        level: e.level,
        type: e.type,
        msg: e.msg,
      }));

  const mapSub = isSim
    ? "SIMULATED · SIMPLIFIED ORBIT MODEL (NOT SGP4)"
    : `${mode === "REPLAY" ? "REPLAY" : "LIVE"} · SGP4 · TLE EPOCH ${orbit.tle ? fmtIso(orbit.tle.epoch) : "—"}`;

  const posInfo = orbit.position
    ? `LAT ${orbit.position.lat.toFixed(2)}° LON ${orbit.position.lon.toFixed(2)}° · ALT ${orbit.position.altKm.toFixed(0)} km · VEL ${orbit.position.velocityKmS.toFixed(2)} km/s`
    : "POSITION UNAVAILABLE";

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: C.bg, color: C.text }}>
      <TopBar store={store} orbit={orbit} telemetry={telemetry} linkLabel={linkLabel} linkOn={linkOn} contactPhase={contactPhase} />
      <div className="grid gap-2 p-2 grid-cols-1 lg:grid-cols-12">
        <Panel
          title="ORBIT / GROUND TRACK"
          className="lg:col-span-5"
          style={{ height: 400 }}
          right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>{posInfo}</span>}
        >
          <WorldMap
            position={orbit.position}
            trackPast={trackPast}
            trackFuture={trackFuture}
            stations={mapStations}
            label={store.profile.name}
            subLabel={mapSub}
            inLink={linkOn}
            trackCacheKey={Math.floor(nowMs / 20000)}
            now={store.displayNow}
          />
        </Panel>

        <Panel
          title={isSim ? "ANTENNA CONTROL — VIRTUAL STATIONS" : "STATION VISIBILITY — PASSIVE"}
          className="lg:col-span-4"
          style={{ height: 400 }}
        >
          {isSim ? <AntennaPanel store={store} geoms={snap.geoms} /> : <StationVisibilityPanel looks={looks} />}
        </Panel>

        <Panel title="TELEMETRY" className="lg:col-span-3" style={{ height: 400 }}>
          {isSim ? <TelemetryPanel tlm={snap.tlm} sim={store.sim} /> : <LiveTelemetryPanel snap={telemetry} />}
        </Panel>

        <div className="lg:col-span-5 grid grid-rows-2 gap-2" style={{ height: 440 }}>
          <Panel title={isSim ? "PASS SCHEDULE — NEXT 24H (SIM)" : "PASS PREDICTION — SGP4 · NEXT 24H"}>
            <PassTimeline
              nowMs={nowMs}
              stations={store.stations}
              passes={timelinePasses}
              netWindows={netWindows}
              realPrediction={!isSim}
            />
          </Panel>
          <Panel title={isSim ? "DOWNLINK / FILE TRANSFER (VIRTUAL)" : "RECEIVED OBSERVATION / DECODED FRAME BROWSER"}>
            {isSim ? <DownlinkPanel files={store.sim.files} /> : <ObservationBrowser set={observations} />}
          </Panel>
        </div>

        <Panel
          title={isSim ? "COMMAND CONSOLE (VIRTUAL UPLINK)" : "COMMAND REHEARSAL CONSOLE — NO TRANSMISSION"}
          className="lg:col-span-4"
          style={{ height: 440 }}
        >
          {isSim ? <CommandPanel store={store} inLink={snap.inLink} /> : <RehearsalConsole store={store} />}
        </Panel>

        <div className="lg:col-span-3 grid gap-2" style={{ height: 440, gridTemplateRows: "150px 1fr" }}>
          <Panel
            title="ADVISORIES"
            right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>{advisories.active.length} ACTIVE</span>}
          >
            <AdvisoryPanel active={advisories.active} acked={advisories.acked} onAck={(id) => store.ackAdvisory(id)} />
          </Panel>
          <Panel
            title="EVENT LOG"
            right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>{logEntries.length} EVENTS</span>}
          >
            <EventLog entries={logEntries} />
          </Panel>
        </div>

        <Panel title="PROVIDER HEALTH" className="lg:col-span-4" style={{ height: 240 }}>
          <ProviderHealthPanel health={health} />
        </Panel>
        <Panel title="OPERATIONS CHECKLIST" className="lg:col-span-3" style={{ height: 240 }}>
          <OperationsChecklist items={checklist} />
        </Panel>
        <Panel
          title="GROUND STATIONS"
          className="lg:col-span-5"
          style={{ height: 240 }}
          right={<span style={{ fontSize: 9, color: C.dim, fontFamily: MONO }}>USER-EDITABLE · STORED LOCALLY</span>}
        >
          <GroundStationEditor store={store} />
        </Panel>
      </div>
      <div className="border-t" style={{ color: C.dim, borderColor: C.line, fontSize: 8.5, letterSpacing: "0.12em", padding: "4px 12px" }}>
        READ-ONLY MISSION DASHBOARD · SIMULATED / LIVE READ-ONLY / REPLAY · NO UPLINK · NO RF TRANSMISSION · NO SPACECRAFT CONTROL ·
        DATA: CELESTRAK (GP/TLE) + SATNOGS (PUBLIC OBSERVATIONS) VIA LOCAL BFF
      </div>
    </div>
  );
}
