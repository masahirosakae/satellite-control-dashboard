import { useMemo } from "react";
import type { GeoPoint } from "../../domain/types";
import { destPoint } from "../../domain/geo";
import { C, MONO } from "../layout/theme";

const CONTINENTS: number[][][] = [
  [[-168,65],[-155,71],[-130,70],[-110,73],[-85,70],[-75,62],[-60,60],[-55,52],[-65,45],[-70,42],[-75,35],[-81,31],[-81,25],[-90,29],[-97,26],[-97,20],[-92,15],[-83,9],[-79,8],[-85,12],[-95,16],[-105,20],[-110,23],[-115,30],[-122,37],[-124,43],[-124,48],[-135,58],[-152,58],[-165,60]],
  [[-79,8],[-75,10],[-70,12],[-60,10],[-52,5],[-45,-2],[-35,-7],[-38,-15],[-40,-22],[-48,-28],[-53,-34],[-58,-39],[-65,-45],[-68,-52],[-70,-54],[-73,-50],[-72,-40],[-70,-30],[-70,-18],[-76,-14],[-81,-6],[-80,0]],
  [[-17,15],[-16,22],[-10,30],[-6,35],[3,37],[10,37],[20,32],[32,31],[35,28],[43,12],[51,11],[46,2],[41,-2],[40,-10],[35,-20],[32,-29],[25,-34],[18,-34],[15,-28],[12,-18],[13,-8],[9,-1],[9,4],[4,6],[-8,4],[-13,9]],
  [[-10,36],[-9,43],[-2,44],[-5,48],[-1,49],[3,51],[8,54],[8,57],[12,56],[18,55],[21,59],[24,65],[20,69],[28,71],[40,68],[50,69],[68,69],[75,72],[95,76],[110,74],[130,72],[150,70],[170,70],[178,66],[170,60],[162,58],[158,52],[142,54],[135,44],[130,42],[122,39],[122,30],[110,20],[108,12],[104,8],[100,13],[98,8],[95,15],[90,22],[86,20],[80,15],[77,8],[72,20],[66,25],[57,26],[52,28],[48,30],[55,26],[59,23],[57,19],[52,16],[44,12],[43,15],[38,20],[34,28],[32,31],[27,36],[22,36],[12,38],[5,38],[-6,36]],
  [[114,-22],[113,-26],[115,-34],[124,-33],[130,-32],[136,-35],[140,-38],[147,-38],[150,-37],[153,-30],[153,-25],[146,-19],[142,-11],[136,-12],[132,-11],[126,-14],[122,-17]],
  [[-45,60],[-53,66],[-55,70],[-50,75],[-40,77],[-30,82],[-20,80],[-22,74],[-25,70],[-32,66],[-40,62]],
  [[130,31],[132,34],[135,35],[140,36],[141,39],[142,43],[144,44],[141,42],[140,38],[137,35],[133,34]],
];

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
  track,
  stations,
  label,
  subLabel,
  inLink,
  trackCacheKey,
}: {
  position: GeoPoint | null;
  track: GeoPoint[];
  stations: MapStation[];
  label: string;
  subLabel?: string;
  inLink: boolean;
  trackCacheKey: number;
}) {
  const trackSegs = useMemo(
    () => splitSegments(track),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackCacheKey]
  );

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
      {CONTINENTS.map((poly, i) => (
        <polygon
          key={i}
          points={poly.map((c) => px({ lon: c[0], lat: c[1] }).join(",")).join(" ")}
          fill="#0d1b2e"
          stroke="#1e3352"
          strokeWidth="1"
        />
      ))}
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
      {trackSegs.map(
        (seg, i) =>
          seg.length > 1 && (
            <polyline
              key={i}
              points={seg.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={C.cyan}
              strokeWidth="1.4"
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
