/**
 * LIVE_READ_ONLY / REPLAY: passive per-station look-angle display computed
 * from real SGP4 propagation. This is a DISPLAY ONLY — there is no antenna
 * control of any kind in these modes.
 */
import { C, MONO } from "../layout/theme";
import { SkyDial } from "./SkyDial";
import type { GroundStation, LookAngles } from "../../domain/types";

export interface StationLook {
  station: GroundStation;
  look: LookAngles | null;
  visible: boolean;
}

export function StationVisibilityPanel({ looks }: { looks: StationLook[] }) {
  return (
    <div className="h-full flex flex-col">
      <div
        style={{ fontSize: 8.5, letterSpacing: "0.12em", color: C.amber, padding: "4px 10px", borderBottom: "1px solid " + C.line }}
      >
        PASSIVE TRACKING DISPLAY — NO ANTENNA CONTROL / NO RF TRANSMISSION
      </div>
      <div className="p-2 grid grid-cols-1 gap-2 overflow-y-auto flex-1 content-start">
        {looks.length === 0 && (
          <div style={{ color: C.dim, fontFamily: MONO, fontSize: 10, padding: 8 }}>
            No look angles — orbit data unavailable.
          </div>
        )}
        {looks.map(({ station, look, visible }) => (
          <div key={station.id} className="flex gap-2 rounded border p-2" style={{ borderColor: C.line, background: C.panel2 }}>
            <SkyDial az={look?.azimuthDeg ?? 0} el={look?.elevationDeg ?? 0} visible={visible} />
            <div className="flex-1 min-w-0" style={{ fontFamily: MONO }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                  {station.id} {station.name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    color: visible ? C.green : C.dim,
                  }}
                >
                  {visible ? "● VISIBLE" : "○ BELOW MASK"}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1" style={{ fontSize: 10 }}>
                <div>
                  <span style={{ color: C.dim }}>AZ </span>
                  <span style={{ color: C.cyan }}>{look ? look.azimuthDeg.toFixed(1) + "°" : "—"}</span>
                </div>
                <div>
                  <span style={{ color: C.dim }}>EL </span>
                  <span style={{ color: visible ? C.green : C.cyan }}>{look ? look.elevationDeg.toFixed(1) + "°" : "—"}</span>
                </div>
                <div>
                  <span style={{ color: C.dim }}>RNG </span>
                  <span style={{ color: C.text }}>{look ? Math.round(look.rangeKm) + " km" : "—"}</span>
                </div>
                <div>
                  <span style={{ color: C.dim }}>MASK </span>
                  <span style={{ color: C.dim }}>{station.minElevationDeg}°</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
