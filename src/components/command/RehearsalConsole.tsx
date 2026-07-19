/**
 * Command Rehearsal Console (LIVE_READ_ONLY / REPLAY).
 * Commands are recorded to a training log ONLY. There is no code path from
 * this console to any network, RF or ground-station endpoint.
 */
import { useEffect, useState } from "react";
import { COMMANDS } from "../../domain/commandRehearsal";
import type { RehearsalMode, RehearsalStatus } from "../../domain/types";
import { C, MONO, LBL, fmtIso } from "../layout/theme";
import type { MissionStore } from "../../store/missionStore";

const STATUS_COLOR: Record<RehearsalStatus, string> = {
  CREATED: C.dim,
  REHEARSAL_ACK: C.cyan,
  REHEARSAL_EXEC: C.green,
  REHEARSAL_FAIL: C.red,
};

const MODE_BADGE: Record<RehearsalMode, { color: string }> = {
  LIVE_READ_ONLY: { color: C.green },
  REPLAY: { color: C.cyan },
};

function ModeBadge({ mode }: { mode: RehearsalMode }) {
  const color = MODE_BADGE[mode].color;
  return (
    <span
      className="rounded border"
      style={{
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: "0.06em",
        padding: "1px 5px",
        color,
        borderColor: color,
        background: color + "1a",
      }}
    >
      {mode}
    </span>
  );
}

export function RehearsalConsole({ store }: { store: MissionStore }) {
  const [cmd, setCmd] = useState(COMMANDS[0].name);
  const [param, setParam] = useState("");
  const [armed, setArmed] = useState(false);
  const def = COMMANDS.find((c) => c.name === cmd);
  const rehearsals = store.getRehearsals();
  useEffect(() => {
    setParam(def?.param ? def.param.default : "");
  }, [cmd, def]);

  const handleCmdChange = (name: string) => {
    setCmd(name);
    setArmed(false);
  };
  const handleParamChange = (value: string) => {
    setParam(value);
    setArmed(false);
  };

  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-hidden">
      <div
        className="rounded border"
        style={{ borderColor: C.red, color: C.red, fontSize: 9.5, letterSpacing: "0.08em", padding: "5px 8px", background: "rgba(244,88,93,0.08)" }}
      >
        COMMAND REHEARSAL / DIGITAL TWIN — commands are saved to a training log only.
        NO UPLINK · NO RF TRANSMISSION · NO SPACECRAFT CONTROL.
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>COMMAND</span>
          <select
            value={cmd}
            onChange={(e) => handleCmdChange(e.target.value)}
            className="rounded outline-none"
            style={{ background: "#050a13", border: "1px solid " + C.line, color: C.text, fontFamily: MONO, fontSize: 11, padding: "4px 8px" }}
          >
            {COMMANDS.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        {def?.param && (
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span style={LBL}>{def.param.label}</span>
            <input
              value={param}
              onChange={(e) => handleParamChange(e.target.value)}
              className="rounded w-28 outline-none"
              style={{ background: "#050a13", border: "1px solid " + C.line, color: C.amber, fontFamily: MONO, fontSize: 11, padding: "4px 8px" }}
            />
          </div>
        )}
        <button
          onClick={() => setArmed(true)}
          className="rounded"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "5px 16px",
            background: armed ? "rgba(245,176,74,0.18)" : "#0e1729",
            color: armed ? C.amber : C.dim,
            border: "1px solid " + (armed ? C.amber : C.line),
            cursor: "pointer",
          }}
        >
          {armed ? "ARMED — READY" : "ARM REHEARSAL"}
        </button>
        <button
          onClick={() => {
            if (!armed) return;
            store.createRehearsal(cmd, def?.param ? param : null);
            setArmed(false);
          }}
          disabled={!armed}
          className="rounded"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "5px 16px",
            background: armed ? "rgba(139,123,244,0.18)" : "#0e1729",
            color: armed ? C.violet : C.dim,
            border: "1px solid " + (armed ? C.violet : C.line),
            cursor: armed ? "pointer" : "default",
          }}
        >
          SIMULATE COMMAND ◇
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded border" style={{ borderColor: C.line, background: "#070d18" }}>
        <table className="w-full" style={{ fontFamily: MONO, fontSize: 10 }}>
          <thead className="sticky top-0" style={{ background: C.panel2 }}>
            <tr style={{ color: C.dim }}>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>ID</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>MODE</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>WALL UTC</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>CTX</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>COMMAND</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>PARAM</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>RESULT</th>
            </tr>
          </thead>
          <tbody>
            {rehearsals.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center" style={{ color: C.dim, padding: "12px 8px" }}>
                  No rehearsal commands recorded yet.
                </td>
              </tr>
            )}
            {rehearsals.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid " + C.line, color: C.text }}>
                <td style={{ padding: "3px 8px", color: C.violet }}>{r.id}</td>
                <td style={{ padding: "3px 8px" }}><ModeBadge mode={r.createdInMode} /></td>
                <td style={{ padding: "3px 8px" }}>{fmtIso(r.createdAtWallClock)}</td>
                <td style={{ padding: "3px 8px" }}>{fmtIso(r.contextTimestamp)}</td>
                <td style={{ padding: "3px 8px" }}>{r.name}</td>
                <td style={{ padding: "3px 8px", color: C.amber }}>{r.param || "—"}</td>
                <td style={{ padding: "3px 8px", fontWeight: 700, color: STATUS_COLOR[r.status] }}>
                  {r.status + " · NOT TRANSMITTED"}
                  {r.status === "REHEARSAL_FAIL" && r.failReason && (
                    <div style={{ fontWeight: 400, color: C.dim, marginTop: 2 }}>{r.failReason}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
