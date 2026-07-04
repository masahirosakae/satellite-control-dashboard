import { C, MONO } from "../layout/theme";
import { d2r } from "../../domain/geo";

export function SkyDial({ az, el, visible }: { az: number; el: number; visible: boolean }) {
  const R = 34;
  const cx = 40;
  const cy = 40;
  const clampedEl = Math.max(0, Math.min(90, el));
  const r = R * (1 - clampedEl / 90);
  const a = d2r(az - 90);
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);
  return (
    <svg viewBox="0 0 80 80" className="shrink-0" style={{ width: 72, height: 72 }}>
      {[R, R * 0.66, R * 0.33].map((rr, i) => (
        <circle key={i} cx={cx} cy={cy} r={rr} fill="none" stroke="#1c2c45" strokeWidth="1" />
      ))}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#16233a" />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#16233a" />
      <text x={cx} y={7} fontSize="7" fill={C.dim} textAnchor="middle" style={{ fontFamily: MONO }}>N</text>
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={visible ? C.green : C.dim} strokeWidth="1.4" />
      <circle cx={x} cy={y} r="3" fill={visible ? C.green : "#39516f"} />
    </svg>
  );
}
