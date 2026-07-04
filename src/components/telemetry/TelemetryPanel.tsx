/** SIMULATED mode telemetry: generated values + history charts. */
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { C, MONO, fmtUTC } from "../layout/theme";
import { simDate, type SimTelemetry, type Simulator } from "../../services/simulator/Simulator";
import { FreshnessChip } from "../layout/FreshnessChip";

export function TelemetryPanel({ tlm, sim }: { tlm: SimTelemetry; sim: Simulator }) {
  const cards = [
    { l: "BATT VOLTAGE", v: String(tlm.battV), u: "V", warn: tlm.battV < 7.25, small: false },
    { l: "BATT CURRENT", v: (tlm.battI > 0 ? "+" : "") + tlm.battI, u: "A", warn: false, small: false },
    { l: "TEMPERATURE", v: String(tlm.temp), u: "°C", warn: tlm.temp > 26, small: false },
    { l: "ATT R/P/Y", v: tlm.roll + "/" + tlm.pitch + "/" + tlm.yaw, u: "°", warn: false, small: true },
    { l: "DOWNLINK", v: (tlm.downlink / 1000).toFixed(1), u: "kbps", warn: false, small: false },
    { l: "STORAGE", v: String(tlm.storage), u: "%", warn: false, small: false },
    { l: "CPU LOAD", v: String(tlm.cpu), u: "%", warn: false, small: false },
    { l: "SIGNAL", v: tlm.signal <= -140 ? "—" : String(tlm.signal), u: "dBm", warn: false, small: false },
  ];
  const data = sim.history.map((h) => ({
    x: fmtUTC(simDate(h.t)).slice(0, 5),
    battV: h.battV,
    temp: h.temp,
    dl: +(h.downlink / 1000).toFixed(1),
    sig: h.signal,
  }));
  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim }}>VIRTUAL TELEMETRY — GENERATED VALUES</span>
        <FreshnessChip status="SIMULATED" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {cards.map((c) => (
          <div
            key={c.l}
            className="rounded border"
            style={{ borderColor: c.warn ? C.amber : C.line, background: C.panel2, padding: "4px 8px" }}
          >
            <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim }}>{c.l}</div>
            <div
              style={{
                fontSize: c.small ? 12 : 17,
                color: c.warn ? C.amber : C.text,
                fontFamily: MONO,
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              {c.v}
              <span style={{ fontSize: 9, marginLeft: 4, color: C.dim }}>{c.u}</span>
            </div>
          </div>
        ))}
      </div>
      {[
        { title: "POWER / THERMAL", lines: [["battV", C.green], ["temp", C.amber]] as const },
        { title: "LINK — RATE / SIGNAL", lines: [["dl", C.cyan], ["sig", C.violet]] as const },
      ].map((ch) => (
        <div
          key={ch.title}
          className="rounded border flex-1"
          style={{ borderColor: C.line, background: C.panel2, minHeight: 110, padding: 4 }}
        >
          <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim, padding: "2px 4px" }}>{ch.title}</div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -14 }}>
              <XAxis
                dataKey="x"
                tick={{ fontSize: 8, fill: C.dim, fontFamily: MONO }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={{ stroke: C.line }}
              />
              <YAxis tick={{ fontSize: 8, fill: C.dim, fontFamily: MONO }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#0a1120", border: "1px solid " + C.line, fontSize: 10, fontFamily: MONO }}
                labelStyle={{ color: C.dim }}
              />
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
