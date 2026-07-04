/**
 * Ground station CRUD. Stations are only ever explicit user input, stored in
 * localStorage. No addresses are pre-filled; defaults are public
 * institutional sites used as demo samples.
 */
import { useState } from "react";
import type { GroundStation } from "../../domain/types";
import { C, MONO, LBL } from "../layout/theme";
import type { MissionStore } from "../../store/missionStore";

const cell = {
  background: "#050a13",
  border: "1px solid " + C.line,
  color: C.text,
  fontFamily: MONO,
  fontSize: 10,
  padding: "2px 4px",
  borderRadius: 3,
} as const;

export function GroundStationEditor({ store }: { store: MissionStore }) {
  const [draft, setDraft] = useState({ name: "", lat: "", lon: "", altM: "0", minEl: "10" });

  const add = () => {
    const lat = Number(draft.lat);
    const lon = Number(draft.lon);
    if (!draft.name.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return;
    }
    store.addStation({
      id: "GS-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      name: draft.name.trim().toUpperCase().slice(0, 24),
      lat,
      lon,
      altM: Number.isFinite(Number(draft.altM)) ? Number(draft.altM) : 0,
      minElevationDeg: Math.min(89, Math.max(0, Number(draft.minEl) || 10)),
      isSample: false,
    });
    setDraft({ name: "", lat: "", lon: "", altM: "0", minEl: "10" });
  };

  const upd = (id: string, key: keyof GroundStation) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = key === "name" ? e.target.value.toUpperCase().slice(0, 24) : Number(e.target.value);
    if (key !== "name" && !Number.isFinite(v as number)) return;
    store.updateStation(id, { [key]: v });
  };

  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-y-auto" style={{ fontFamily: MONO }}>
      <table className="w-full" style={{ fontSize: 10 }}>
        <thead>
          <tr style={{ color: C.dim, textAlign: "left" }}>
            <th className="font-normal" style={{ padding: "2px 4px" }}>NAME</th>
            <th className="font-normal" style={{ padding: "2px 4px" }}>LAT</th>
            <th className="font-normal" style={{ padding: "2px 4px" }}>LON</th>
            <th className="font-normal" style={{ padding: "2px 4px" }}>ALT m</th>
            <th className="font-normal" style={{ padding: "2px 4px" }}>MIN EL°</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {store.stations.map((s) => (
            <tr key={s.id}>
              <td style={{ padding: "2px 4px" }}>
                <input style={{ ...cell, width: 92 }} value={s.name} onChange={upd(s.id, "name")} />
              </td>
              <td style={{ padding: "2px 4px" }}>
                <input style={{ ...cell, width: 60 }} type="number" step="0.01" value={s.lat} onChange={upd(s.id, "lat")} />
              </td>
              <td style={{ padding: "2px 4px" }}>
                <input style={{ ...cell, width: 64 }} type="number" step="0.01" value={s.lon} onChange={upd(s.id, "lon")} />
              </td>
              <td style={{ padding: "2px 4px" }}>
                <input style={{ ...cell, width: 50 }} type="number" value={s.altM} onChange={upd(s.id, "altM")} />
              </td>
              <td style={{ padding: "2px 4px" }}>
                <input style={{ ...cell, width: 42 }} type="number" value={s.minElevationDeg} onChange={upd(s.id, "minElevationDeg")} />
              </td>
              <td style={{ padding: "2px 4px" }}>
                <button
                  onClick={() => store.removeStation(s.id)}
                  title="delete station"
                  style={{ ...cell, color: C.red, borderColor: C.red, cursor: "pointer" }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-1" style={{ borderTop: "1px solid " + C.line, paddingTop: 6 }}>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>NAME</span>
          <input style={{ ...cell, width: 92 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>LAT</span>
          <input style={{ ...cell, width: 60 }} value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} />
        </div>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>LON</span>
          <input style={{ ...cell, width: 64 }} value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: e.target.value })} />
        </div>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>ALT m</span>
          <input style={{ ...cell, width: 50 }} value={draft.altM} onChange={(e) => setDraft({ ...draft, altM: e.target.value })} />
        </div>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <span style={LBL}>MIN EL°</span>
          <input style={{ ...cell, width: 42 }} value={draft.minEl} onChange={(e) => setDraft({ ...draft, minEl: e.target.value })} />
        </div>
        <button
          onClick={add}
          style={{ ...cell, color: C.green, borderColor: C.green, cursor: "pointer", fontWeight: 800, letterSpacing: "0.1em" }}
        >
          + ADD
        </button>
      </div>
      <div style={{ fontSize: 8.5, color: C.dim }}>
        Stations are saved in this browser only (localStorage). Enter only locations you are comfortable storing —
        no addresses are pre-filled.
      </div>
    </div>
  );
}
