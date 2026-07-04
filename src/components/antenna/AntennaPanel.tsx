/** SIMULATED mode only: virtual antenna auto-track / manual override. */
import { C, MONO } from "../layout/theme";
import { SkyDial } from "./SkyDial";
import type { MissionStore } from "../../store/missionStore";
import type { SimStationGeom } from "../../services/simulator/Simulator";

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(+e.target.value)}
      className="w-14 rounded outline-none"
      style={{ background: "#050a13", border: "1px solid " + C.line, color: C.amber, fontFamily: MONO, fontSize: 10, padding: "0 4px" }}
    />
  );
}

export function AntennaPanel({ store, geoms }: { store: MissionStore; geoms: SimStationGeom[] }) {
  const sim = store.sim;
  return (
    <div className="p-2 grid grid-cols-1 gap-2 overflow-y-auto h-full content-start">
      {geoms.map((g, i) => {
        const st = sim.antennas[i];
        if (!st) return null;
        const az = st.auto ? g.az : st.manAz;
        const el = st.auto ? g.el : st.manEl;
        return (
          <div key={g.gs.id} className="flex gap-2 rounded border p-2" style={{ borderColor: C.line, background: C.panel2 }}>
            <SkyDial az={az} el={el} visible={g.inRange} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: MONO }}>
                  {g.gs.id} {g.gs.name}
                </span>
                <button
                  onClick={() => {
                    Object.assign(st, { auto: !st.auto, manAz: Math.round(g.az), manEl: Math.round(g.el) });
                  }}
                  className="rounded"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    padding: "2px 6px",
                    background: st.auto ? "rgba(63,224,137,0.15)" : "#182741",
                    color: st.auto ? C.green : C.dim,
                    border: "1px solid " + (st.auto ? C.green : C.line),
                  }}
                >
                  AUTO TRACK {st.auto ? "ON" : "OFF"}
                </button>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1" style={{ fontFamily: MONO, fontSize: 10 }}>
                <div>
                  <span style={{ color: C.dim }}>AZ </span>
                  {st.auto ? (
                    <span style={{ color: C.cyan }}>{az.toFixed(1)}°</span>
                  ) : (
                    <NumInput value={st.manAz} onChange={(v) => (st.manAz = v)} />
                  )}
                </div>
                <div>
                  <span style={{ color: C.dim }}>EL </span>
                  {st.auto ? (
                    <span style={{ color: C.cyan }}>{el.toFixed(1)}°</span>
                  ) : (
                    <NumInput value={st.manEl} onChange={(v) => (st.manEl = v)} />
                  )}
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
