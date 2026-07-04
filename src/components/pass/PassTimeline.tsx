/** Mode-agnostic pass schedule timeline. Times are epoch ms. */
import type { GroundStation } from "../../domain/types";
import { C, MONO, fmtDur, fmtUTC } from "../layout/theme";

export interface TimelinePass {
  stationId: string;
  aosMs: number;
  losMs: number;
  maxElevationDeg: number | null;
  aosAzimuthDeg: number | null;
  losAzimuthDeg: number | null;
}

export function PassTimeline({
  nowMs,
  stations,
  passes,
  spanS = 6 * 3600,
  realPrediction,
}: {
  nowMs: number;
  stations: GroundStation[];
  passes: TimelinePass[];
  spanS?: number;
  /** true when passes come from SGP4 (LIVE/REPLAY) — shows max-el details */
  realPrediction: boolean;
}) {
  const next = passes.find((p) => p.aosMs > nowMs);
  const current = passes.find((p) => p.aosMs <= nowMs && p.losMs > nowMs);
  const nameOf = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: MONO, fontSize: 10 }}>
        <span>
          <span style={{ color: C.dim }}>{current ? "CURRENT PASS " : "NEXT PASS "}</span>
          <span style={{ color: current ? C.green : C.cyan }}>
            {current
              ? nameOf(current.stationId) + " → LOS " + fmtUTC(new Date(current.losMs)) + " (T-" + fmtDur((current.losMs - nowMs) / 1000) + ")"
              : next
                ? nameOf(next.stationId) + " AOS " + fmtUTC(new Date(next.aosMs)) + " (T-" + fmtDur((next.aosMs - nowMs) / 1000) + ")"
                : "no pass in horizon"}
          </span>
        </span>
        {realPrediction && (current ?? next) && (
          <span style={{ color: C.dim }}>
            MAX EL{" "}
            <span style={{ color: C.amber }}>
              {((current ?? next)!.maxElevationDeg ?? 0).toFixed(0)}°
            </span>
            {"  AZ "}
            <span style={{ color: C.cyan }}>
              {((current ?? next)!.aosAzimuthDeg ?? 0).toFixed(0)}°→{((current ?? next)!.losAzimuthDeg ?? 0).toFixed(0)}°
            </span>
            {"  DUR "}
            <span style={{ color: C.text }}>{fmtDur(((current ?? next)!.losMs - (current ?? next)!.aosMs) / 1000)}</span>
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-around gap-1">
        {stations.map((gs) => (
          <div key={gs.id} className="flex items-center gap-2">
            <span className="w-20 shrink-0" style={{ color: C.dim, fontFamily: MONO, fontSize: 9 }}>
              {gs.name}
            </span>
            <div
              className="relative flex-1 h-4 overflow-hidden"
              style={{ background: "#070d18", border: "1px solid " + C.line, borderRadius: 2 }}
            >
              {passes
                .filter((p) => p.stationId === gs.id && p.losMs > nowMs && p.aosMs < nowMs + spanS * 1000)
                .map((p, i) => {
                  const l = Math.max(0, ((p.aosMs - nowMs) / (spanS * 1000)) * 100);
                  const r = Math.min(100, ((p.losMs - nowMs) / (spanS * 1000)) * 100);
                  const active = p.aosMs <= nowMs && p.losMs > nowMs;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0"
                      title={
                        "AOS " + fmtUTC(new Date(p.aosMs)) + " / LOS " + fmtUTC(new Date(p.losMs)) +
                        (p.maxElevationDeg !== null ? " / MAX EL " + p.maxElevationDeg.toFixed(0) + "°" : "")
                      }
                      style={{
                        left: l + "%",
                        width: Math.max(0.6, r - l) + "%",
                        borderRadius: 2,
                        background: active ? "rgba(63,224,137,0.55)" : "rgba(79,216,235,0.3)",
                        border: "1px solid " + (active ? C.green : C.cyan),
                      }}
                    />
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
