import { useEffect, useState } from "react";
import type { OrbitState, TelemetrySnapshot } from "../../domain/types";
import { fmtAge } from "../../domain/freshness";
import { C, MONO, fmtUTC, fmtUTCDate, fmtIso } from "./theme";
import { FreshnessChip } from "./FreshnessChip";
import type { MissionStore } from "../../store/missionStore";
import { simDate } from "../../services/simulator/Simulator";

function Btn({
  label,
  onClick,
  active,
  color = C.cyan,
  title,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  color?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded"
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.12em",
        padding: "4px 10px",
        background: active ? color + "22" : "#0e1729",
        color: active ? color : C.dim,
        border: "1px solid " + (active ? color : C.line),
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {label}
    </button>
  );
}

export function TopBar({
  store,
  orbit,
  telemetry,
  linkLabel,
  linkOn,
}: {
  store: MissionStore;
  orbit: OrbitState;
  telemetry: TelemetrySnapshot;
  linkLabel: string;
  linkOn: boolean;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const mode = store.mode;
  const profile = store.profile;
  const sim = store.sim;

  return (
    <div className="border-b" style={{ background: "#080e19", borderColor: C.line }}>
      {/* Row 1: identity, mode, safety banner, link state */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ padding: "8px 12px 4px" }}>
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.22em", color: C.text }}>{profile.name}</span>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: C.dim, fontFamily: MONO }}>
            NORAD {profile.noradId ?? "— (VIRTUAL)"}
          </span>
        </div>

        <div className="flex gap-1">
          <Btn label="SIMULATED" active={mode === "SIMULATED"} color={C.violet} onClick={() => store.setMode("SIMULATED")} />
          <Btn label="LIVE READ-ONLY" active={mode === "LIVE_READ_ONLY"} color={C.green} onClick={() => store.setMode("LIVE_READ_ONLY")} />
          <Btn label="REPLAY" active={mode === "REPLAY"} color={C.cyan} onClick={() => store.setMode("REPLAY")} />
        </div>

        {mode === "LIVE_READ_ONLY" && (
          <span
            className="rounded"
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.1em",
              fontFamily: MONO,
              color: C.red,
              border: "1px solid " + C.red,
              background: "rgba(244,88,93,0.1)",
              padding: "3px 8px",
            }}
          >
            READ-ONLY LIVE DATA · NO UPLINK / NO RF TRANSMISSION / NO SPACECRAFT CONTROL
          </span>
        )}
        {mode === "REPLAY" && (
          <span
            className="rounded"
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.1em",
              fontFamily: MONO,
              color: C.cyan,
              border: "1px solid " + C.cyan,
              background: "rgba(79,216,235,0.08)",
              padding: "3px 8px",
            }}
          >
            REPLAY OF RECORDED DATA — NOT LIVE
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {linkOn && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full" style={{ background: C.green, opacity: 0.6 }} />
            )}
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: linkOn ? C.green : C.red }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.2em", fontFamily: MONO, color: linkOn ? C.green : C.red }}>
            {linkLabel}
          </span>
        </div>
      </div>

      {/* Row 2: clocks, time controls, sources & freshness */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ padding: "4px 12px 8px", fontFamily: MONO, fontSize: 10 }}>
        <span>
          <span style={{ color: C.dim }}>UTC </span>
          <span style={{ color: C.text }}>{fmtUTC(now)}</span>
        </span>

        {mode === "SIMULATED" && (
          <>
            <span>
              <span style={{ color: C.dim }}>SIM </span>
              <span style={{ color: C.violet }}>{fmtUTCDate(simDate(sim.simT))}</span>
            </span>
            <div className="flex gap-1">
              <Btn label={sim.running ? "RUNNING" : "START"} active={sim.running} color={C.green} onClick={() => { sim.start(); }} />
              <Btn label="PAUSE" active={!sim.running} color={C.amber} onClick={() => { sim.pause(); }} />
              <Btn label="RESET" color={C.red} onClick={() => { sim.reset(); }} />
            </div>
            <div className="flex gap-1">
              {[1, 10, 60, 120].map((s) => (
                <Btn key={s} label={s + "x"} active={sim.speed === s} onClick={() => sim.setSpeed(s)} />
              ))}
            </div>
          </>
        )}

        {mode === "REPLAY" && (
          <>
            <span>
              <span style={{ color: C.dim }}>REPLAY </span>
              <span style={{ color: C.cyan }}>{fmtUTCDate(new Date(store.replayMs))}</span>
            </span>
            <div className="flex gap-1">
              <Btn label={store.replayRunning ? "PLAYING" : "PLAY"} active={store.replayRunning} color={C.green} onClick={() => store.replayPlay()} />
              <Btn label="PAUSE" active={!store.replayRunning} color={C.amber} onClick={() => store.replayPause()} />
              <Btn label="RESTART" color={C.red} onClick={() => store.replayRestart()} />
            </div>
            <div className="flex gap-1">
              {[1, 60, 300, 900].map((s) => (
                <Btn key={s} label={s + "x"} active={store.replaySpeed === s} onClick={() => store.setReplaySpeed(s)} />
              ))}
            </div>
          </>
        )}

        {mode === "LIVE_READ_ONLY" && (
          <span>
            <span style={{ color: C.dim }}>TIME </span>
            <span style={{ color: C.green }}>REAL-TIME (WALL CLOCK)</span>
          </span>
        )}

        <span className="flex items-center gap-1">
          <span style={{ color: C.dim }}>ORBIT </span>
          <span style={{ color: C.text }}>{orbit.provenance.sourceName}</span>
          <FreshnessChip
            status={orbit.provenance.freshness}
            title={orbit.tle ? "TLE epoch " + fmtIso(orbit.tle.epoch) + " · age " + fmtAge(orbit.tleAgeHours) : undefined}
          />
        </span>
        {orbit.tle && (
          <span>
            <span style={{ color: C.dim }}>TLE EPOCH </span>
            <span style={{ color: orbit.provenance.freshness === "STALE" ? C.red : C.cyan }}>
              {fmtIso(orbit.tle.epoch)} ({fmtAge(orbit.tleAgeHours)})
            </span>
          </span>
        )}

        <span className="flex items-center gap-1">
          <span style={{ color: C.dim }}>TLM </span>
          <span style={{ color: C.text }}>{telemetry.provenance.sourceName}</span>
          <FreshnessChip
            status={telemetry.provenance.freshness}
            title={"observed " + fmtIso(telemetry.observedAt) + " · fetched " + fmtIso(telemetry.provenance.fetchedAt)}
          />
        </span>
      </div>
    </div>
  );
}
