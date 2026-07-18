import { useMemo } from "react";
import type { GeoPoint, OrbitPosition } from "../../domain/types";
import { destPoint, footprintCircle } from "../../domain/geo";
import { nightPolygon } from "../../domain/terminator";
import { C, MONO } from "../layout/theme";
import worldCoastlines from "../../assets/world-110m.json";

/**
 * Coastline polylines derived offline from the public-domain Natural Earth
 * dataset (world-atlas, 110m resolution) by scripts/generate-world-geo.mjs.
 * Loaded here as a plain static import — no fetch, no runtime network I/O.
 */
const COASTLINES: number[][][] = worldCoastlines as number[][][];

const W = 720;
const H = 360;
const px = (p: GeoPoint): [number, number] => [((p.lon + 180) / 360) * W, ((90 - p.lat) / 180) * H];

/** Split a polyline at the antimeridian wrap. */
function splitSegments(points: GeoPoint[]): [number, number][][] {
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prev: [number, number] | null = null;
  for (const gp of points) {
    const p = px(gp);
    if (prev && Math.abs(p[0] - prev[0]) > W / 2) {
      segs.push(cur);
      cur = [];
    }
    cur.push(p);
    prev = p;
  }
  segs.push(cur);
  return segs;
}

export interface MapStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  active: boolean;
  /** comm range circle (SIMULATED mode only) */
  rangeKm?: number;
}

export function WorldMap({
  position,
  trackPast,
  trackFuture,
  stations,
  label,
  subLabel,
  inLink,
  trackCacheKey,
  now,
}: {
  position: OrbitPosition | null;
  /** Ground track samples at or before `now`. */
  trackPast: GeoPoint[];
  /** Ground track samples after `now`. */
  trackFuture: GeoPoint[];
  stations: MapStation[];
  label: string;
  subLabel?: string;
  inLink: boolean;
  trackCacheKey: number;
  /** Mission clock driving the day/night terminator (SIMULATED sim-time, wall time, or replay clock). */
  now: Date;
}) {
  const pastSegs = useMemo(
    () => splitSegments(trackPast),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackCacheKey]
  );
  const futureSegs = useMemo(
    () => splitSegments(trackFuture),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackCacheKey]
  );

  const coastlineSegs = useMemo(
    () => COASTLINES.map((poly) => poly.map((c) => px({ lon: c[0], lat: c[1] }))),
    []
  );

  const nightSeg = useMemo(() => {
    const poly = nightPolygon(now, 3);
    return poly.map((p) => px(p));
  }, [now]);

  const footprintSeg = useMemo(() => {
    if (!position) return null;
    const poly = footprintCircle(position, position.altKm);
    return splitSegments(poly);
  }, [position]);

  const rangeCircle = (gs: MapStation, rangeKm: number) => {
    const pts: GeoPoint[] = [];
    for (let b = 0; b <= 360; b += 12) pts.push(destPoint(gs, b, rangeKm));
    return splitSegments(pts);
  };

  const sp = position ? px(position) : null;

  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: "#04070d", display: "block" }}
    >
      {Array.from({ length: 11 }, (_, i) => (
        <line key={"v" + i} x1={(i + 1) * (W / 12)} y1={0} x2={(i + 1) * (W / 12)} y2={H} stroke="#0f1a2c" strokeWidth="1" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={"h" + i} x1={0} y1={(i + 1) * (H / 6)} x2={W} y2={(i + 1) * (H / 6)} stroke="#0f1a2c" strokeWidth="1" />
      ))}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#16233a" strokeWidth="1.2" />
      {coastlineSegs.map((poly, i) => (
        <polygon key={i} points={poly.map((p) => p.join(",")).join(" ")} fill="#0d1b2e" stroke="#1e3352" strokeWidth="1" />
      ))}
      <polygon points={nightSeg.map((p) => p.join(",")).join(" ")} fill="#000000" opacity="0.1" stroke="none" />
      {footprintSeg &&
        footprintSeg.map(
          (seg, i) =>
            seg.length > 1 && (
              <polygon
                key={"fp" + i}
                points={seg.map((p) => p.join(",")).join(" ")}
                fill={C.cyan}
                fillOpacity="0.06"
                stroke={C.cyan}
                strokeOpacity="0.35"
                strokeWidth="1"
              />
            )
        )}
      {stations.map((g) => {
        const gp = px(g);
        return (
          <g key={g.id}>
            {g.rangeKm !== undefined &&
              rangeCircle(g, g.rangeKm).map(
                (seg, j) =>
                  seg.length > 1 && (
                    <polyline
                      key={j}
                      points={seg.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={g.active ? C.green : "#2a4a6b"}
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      opacity={g.active ? 0.9 : 0.55}
                    />
                  )
              )}
            <rect
              x={gp[0] - 3}
              y={gp[1] - 3}
              width="6"
              height="6"
              fill={g.active ? C.green : C.amber}
              transform={"rotate(45 " + gp[0] + " " + gp[1] + ")"}
            />
            <text x={gp[0] + 7} y={gp[1] + 3} fontSize="9" fill={C.dim} style={{ fontFamily: MONO }}>
              {g.name}
            </text>
          </g>
        );
      })}
      {pastSegs.map(
        (seg, i) =>
          seg.length > 1 && (
            <polyline
              key={"past" + i}
              points={seg.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={C.cyan}
              strokeWidth="1.4"
              opacity="0.4"
            />
          )
      )}
      {futureSegs.map(
        (seg, i) =>
          seg.length > 1 && (
            <polyline
              key={"future" + i}
              points={seg.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={C.cyan}
              strokeWidth="1.4"
              strokeDasharray="5 4"
              opacity="0.65"
            />
          )
      )}
      {sp && position && (
        <>
          <circle cx={sp[0]} cy={sp[1]} r="10" fill="none" stroke={inLink ? C.green : C.cyan} strokeWidth="1" opacity="0.5">
            <animate attributeName="r" values="6;13;6" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={sp[0]} cy={sp[1]} r="3.4" fill={inLink ? C.green : C.cyan} />
          <text x={sp[0] + 9} y={sp[1] - 7} fontSize="10" fontWeight="bold" fill={C.cyan} style={{ fontFamily: MONO }}>
            {label}
          </text>
          <text x={sp[0] + 9} y={sp[1] + 4} fontSize="8.5" fill={C.dim} style={{ fontFamily: MONO }}>
            {position.lat.toFixed(1) + "° " + position.lon.toFixed(1) + "°"}
          </text>
        </>
      )}
      {!position && (
        <text x={W / 2} y={H / 2 - 8} fontSize="12" fontWeight="bold" fill={C.red} textAnchor="middle" style={{ fontFamily: MONO }}>
          ORBIT DATA UNAVAILABLE
        </text>
      )}
      {subLabel && (
        <text x={8} y={H - 8} fontSize="9" fill={C.dim} style={{ fontFamily: MONO }}>
          {subLabel}
        </text>
      )}
    </svg>
  );
}
