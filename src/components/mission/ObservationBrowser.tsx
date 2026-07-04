/**
 * LIVE_READ_ONLY / REPLAY: Received Observation / Decoded Frame Browser.
 * Displays public reception data (e.g. SatNOGS). This is NOT a downlink
 * control — nothing here commands a satellite or a ground station.
 */
import type { ObservationSet } from "../../domain/types";
import { C, MONO, fmtIso, fmtFreqMHz } from "../layout/theme";
import { FreshnessChip } from "../layout/FreshnessChip";

const STATUS_COLOR: Record<string, string> = {
  good: C.green,
  bad: C.amber,
  failed: C.red,
  future: C.dim,
  unknown: C.dim,
};

export function ObservationBrowser({ set }: { set: ObservationSet }) {
  return (
    <div className="h-full flex flex-col" style={{ fontFamily: MONO }}>
      <div className="flex items-center justify-between" style={{ padding: "4px 10px", borderBottom: "1px solid " + C.line }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.12em", color: C.dim }}>
          SRC {set.provenance.sourceName} · FETCHED {fmtIso(set.provenance.fetchedAt)} · READ-ONLY
        </span>
        <FreshnessChip status={set.provenance.freshness} />
      </div>

      {set.status !== "OK" && (
        <div
          style={{
            margin: 8,
            padding: "6px 8px",
            fontSize: 10,
            borderRadius: 4,
            color: set.status === "ERROR" ? C.red : C.amber,
            border: "1px solid " + (set.status === "ERROR" ? C.red : C.amber),
            background: (set.status === "ERROR" ? C.red : C.amber) + "12",
          }}
        >
          {set.status === "NO_DATA" && "NO OBSERVATIONS — the network has no recorded receptions for this satellite yet."}
          {set.status === "ERROR" && "OBSERVATION FETCH FAILED — " + (set.error ?? "provider error")}
          {set.status === "UNAVAILABLE" && (set.error ?? "observations not loaded")}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full" style={{ fontSize: 10 }}>
          <thead className="sticky top-0" style={{ background: C.panel2 }}>
            <tr style={{ color: C.dim }}>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>START (UTC)</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>STATION</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>FREQ</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>MODE</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>STATUS</th>
              <th className="text-left font-normal" style={{ padding: "4px 8px" }}>LINK</th>
            </tr>
          </thead>
          <tbody>
            {set.observations.map((o) => (
              <tr key={String(o.id)} style={{ borderTop: "1px solid #0e1728", color: C.text }}>
                <td style={{ padding: "3px 8px", color: C.cyan }}>{fmtIso(o.start)}</td>
                <td style={{ padding: "3px 8px" }}>{o.stationName}</td>
                <td style={{ padding: "3px 8px" }}>{fmtFreqMHz(o.frequencyHz)}</td>
                <td style={{ padding: "3px 8px", color: C.amber }}>{o.transmitterMode ?? "—"}</td>
                <td style={{ padding: "3px 8px", fontWeight: 700, color: STATUS_COLOR[o.status] ?? C.dim }}>
                  {o.status.toUpperCase()}
                </td>
                <td style={{ padding: "3px 8px" }}>
                  {o.url ? (
                    <a href={o.url} target="_blank" rel="noreferrer" style={{ color: C.violet }}>
                      open ↗
                    </a>
                  ) : (
                    "—"
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
