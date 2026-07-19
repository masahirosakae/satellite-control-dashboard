import { useMemo } from "react";
import type { GeoPoint, OrbitPosition } from "../../domain/types";
import { destPoint, footprintCircle, footprintHalfAngleDeg } from "../../domain/geo";
import { landPolygons, footprintPolygon } from "../../domain/mapPolygon";
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

/**
 * A projected polygon may extend outside the [0, W] viewBox range when it
 * came from an unwrapped (unbounded-lon) ring. Since px() maps lon linearly
 * and one full wrap is exactly W px wide, the polygon is periodic in W: it
 * repeats every W px. Determine which integer multiples of W it must be
 * shifted by so at least one copy overlaps the visible [0, W] range.
 */
function neededShifts(poly: [number, number][]): number[] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [x] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const shifts: number[] = [];
  for (const s of [-W, 0, W]) {
    if (minX + s <= W && maxX + s >= 0) shifts.push(s);
  }
  return shifts;
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

  const landPolys = useMemo(() => landPolygons(COASTLINES).map((ring) => ring.map((p) => px(p))), []);

  const landOutlineSegs = useMemo(
    () =>
      COASTLINES.map((ring) => {
        const pts: GeoPoint[] = ring.map((c) => ({ lon: c[0], lat: c[1] }));
        if (pts.length > 0) pts.push(pts[0]);
        return splitSegments(pts);
      }),
    []
  );

  const nightSeg = useMemo(() => {
    const poly = nightPolygon(now, 3);
    return poly.map((p) => px(p));
  }, [now]);

  const footprintPoly = useMemo(() => {
    if (!position) return null;
    return footprintPolygon(position, position.altKm).map((p) => px(p));
  }, [position]);

  const footprintOutlineSegs = useMemo(() => {
    if (!position) return null;
    if (Math.abs(position.lat) >= 89.9) {
      const r = footprintHalfAngleDeg(position.altKm);
      const lat = position.lat >= 0 ? 90 - r : -90 + r;
      const pts: GeoPoint[] = [];
      for (let lon = -180; lon <= 180; lon += 12) pts.push({ lat, lon });
      return splitSegments(pts);
    }
    return splitSegments(footprintCircle(position, position.altKm));
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
      {landPolys.map((poly, i) =>
        neededShifts(poly).map((s) => (
          <polygon
            key={i + "_" + s}
            points={poly.map((p) => p.join(",")).join(" ")}
            transform={"translate(" + s + " 0)"}
            fill="#0d1b2e"
            stroke="none"
          />
        ))
      )}
      {landOutlineSegs.map((segs, i) =>
        segs.map(
          (seg, j) =>
            seg.length > 1 && (
              <polyline
                key={i + "_" + j}
                points={seg.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="#1e3352"
                strokeWidth="1"
              />
            )
        )
      )}
      <polygon points={nightSeg.map((p) => p.join(",")).join(" ")} fill="#000000" opacity="0.1" stroke="none" />
      {footprintPoly &&
        neededShifts(footprintPoly).map((s) => (
          <polygon
            key={"fp" + s}
            points={footprintPoly.map((p) => p.join(",")).join(" ")}
            transform={"translate(" + s + " 0)"}
            fill={C.cyan}
            fillOpacity="0.06"
            stroke="none"
          />
        ))}
      {footprintOutlineSegs &&
        footprintOutlineSegs.map(
          (seg, i) =>
            seg.length > 1 && (
              <polyline
                key={"fpo" + i}
                points={seg.map((p) => p.join(",")).join(" ")}
                fill="none"
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
