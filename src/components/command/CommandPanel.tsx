/** SIMULATED mode command console — virtual uplink to the simulator only. */
import { useEffect, useState } from "react";
import { COMMANDS } from "../../domain/commandRehearsal";
import { C, MONO, LBL, fmtUTC } from "../layout/theme";
import { simDate } from "../../services/simulator/Simulator";
import type { MissionStore } from "../../store/missionStore";

export function CommandPanel({ store, inLink }: { store: MissionStore; inLink: boolean }) {
  const sim = store.sim;
  const [cmd, setCmd] = useState(COMMANDS[0].name);
  const [param, setParam] = useState("");
  const def = COMMANDS.find((c) => c.name === cmd);
  useEffect(() => {
    setParam(def?.param ? def.param.default : "");
  }, [cmd, def]);
  const statusColor = { PENDING: C.amber, SUCCESS: C.green, FAILED: C.red } as const;
  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>COMMAND</span>
          <select
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
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
              onChange={(e) => setParam(e.target.value)}
              className="rounded w-28 outline-none"
              style={{ background: "#050a13", border: "1px solid " + C.line, color: C.amber, fontFamily: MONO, fontSize: 11, padding: "4px 8px" }}
            />
          </div>
        )}
        <button
          onClick={() => store.sendSimCommand(cmd, def?.param ? param : null)}
          className="rounded"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "5px 16px",
            background: inLink ? "rgba(63,224,137,0.18)" : "rgba(244,88,93,0.12)",
            color: inLink ? C.green : C.red,
            border: "1px solid " + (inLink ? C.green : C.red),
          }}
        >
          SEND {inLink ? "▲" : "⊘"}
        </button>
        {!inLink && <span style={{ fontSize: 9, color: C.red, fontFamily: MONO }}>NO LINK — uplink will fail</span>}
      </div>
      <div style={{ fontSize: 8.5, color: C.dim, letterSpacing: "0.1em" }}>
        VIRTUAL SATELLITE ONLY — commands never leave the simulator
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded border" style={{ borderColor: C.line, background: "#070d18" }}>
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
              <tr>
                <td colSpan={5} className="text-center" style={{ color: C.dim, padding: "12px 8px" }}>
                  No commands sent. Select a command and press SEND during a pass.
                </td>
              </tr>
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
