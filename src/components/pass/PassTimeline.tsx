/** Mode-agnostic pass schedule timeline. Times are epoch ms. */
import type { GroundStation } from "../../domain/types";
import type { NetWindow } from "../../domain/netWindow";
import { C, MONO, fmtDur, fmtUTC } from "../layout/theme";

export interface TimelinePass {
  stationId: string;
  aosMs: number;
  losMs: number;
  maxElevationDeg: number | null;
  aosAzimuthDeg: number | null;
  losAzimuthDeg: number | null;
}

/** Elevation-scaled fill alpha: 0.15..0.6 for inactive bars, 0.3..0.75 for active bars. */
function elevationAlpha(maxElevationDeg: number, active: boolean): number {
  const ratio = Math.min(1, maxElevationDeg / 90);
  return (active ? 0.3 : 0.15) + 0.45 * ratio;
}

function axisLabels(spanS: number): string[] {
  const tickS = spanS / 6;
  const labels = ["NOW"];
  for (let i = 1; i <= 6; i++) {
    const hrs = (tickS * i) / 3600;
    labels.push("+" + (Number.isInteger(hrs) ? hrs : Number(hrs.toFixed(1))) + "h");
  }
  return labels;
}

export function PassTimeline({
  nowMs,
  stations,
  passes,
  netWindows = [],
  spanS = 24 * 3600,
  realPrediction,
}: {
  nowMs: number;
  stations: GroundStation[];
  passes: TimelinePass[];
  /** Merged net contact windows (union across stations), rendered as a lane above the per-station rows. */
  netWindows?: NetWindow[];
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
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0" style={{ color: C.violet, fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>
            NET
          </span>
          <div
            className="relative flex-1 h-4 overflow-hidden"
            style={{ background: "#070d18", border: "1px solid " + C.line, borderRadius: 2 }}
          >
            {netWindows
              .filter((w) => w.endMs > nowMs && w.startMs < nowMs + spanS * 1000)
              .map((w, i) => {
                const l = Math.max(0, ((w.startMs - nowMs) / (spanS * 1000)) * 100);
                const r = Math.min(100, ((w.endMs - nowMs) / (spanS * 1000)) * 100);
                const active = w.startMs <= nowMs && w.endMs > nowMs;
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0"
                    title={
                      "NET " + fmtUTC(new Date(w.startMs)) + " – " + fmtUTC(new Date(w.endMs)) +
                      " · " + w.stationIds.map(nameOf).join(", ")
                    }
                    style={{
                      left: l + "%",
                      width: Math.max(0.6, r - l) + "%",
                      borderRadius: 2,
                      background: active ? "rgba(139,123,244,0.55)" : "rgba(139,123,244,0.3)",
                      border: "1px solid " + C.violet,
                    }}
                  />
                );
              })}
            <div className="absolute top-0 bottom-0 w-px" style={{ left: 0, background: C.red }} />
          </div>
        </div>
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
                  const background =
                    p.maxElevationDeg !== null
                      ? active
                        ? "rgba(63,224,137," + elevationAlpha(p.maxElevationDeg, true) + ")"
                        : "rgba(79,216,235," + elevationAlpha(p.maxElevationDeg, false) + ")"
                      : active
                        ? "rgba(63,224,137,0.55)"
                        : "rgba(79,216,235,0.3)";
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
                        background,
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
        {axisLabels(spanS).map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
