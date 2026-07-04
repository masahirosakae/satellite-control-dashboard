import type { CSSProperties } from "react";
import type { FreshnessStatus } from "../../domain/types";

/** Design tokens (carried over from the original MVP). */
export const C = {
  bg: "#05080f",
  panel: "#0b1220",
  panel2: "#0e1729",
  line: "#1b2a40",
  text: "#c6d4e3",
  dim: "#5c7089",
  cyan: "#4fd8eb",
  green: "#3fe089",
  amber: "#f5b04a",
  red: "#f4585d",
  violet: "#8b7bf4",
};

export const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
export const LBL: CSSProperties = { fontSize: 9, letterSpacing: "0.16em", color: C.dim };

export const FRESHNESS_COLOR: Record<FreshnessStatus, string> = {
  LIVE: C.green,
  DELAYED: C.amber,
  STALE: C.red,
  UNAVAILABLE: C.red,
  SIMULATED: C.violet,
  REPLAY: C.cyan,
};

const p2 = (n: number): string => String(n).padStart(2, "0");
export const fmtUTC = (d: Date): string =>
  p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds());
export const fmtUTCDate = (d: Date): string => d.toISOString().slice(5, 10) + " " + fmtUTC(d);
export const fmtIso = (iso: string | null): string => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : fmtUTCDate(new Date(t));
};
export const fmtDur = (s: number): string => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? h + "h " + p2(m) + "m" : p2(m) + "m " + p2(ss) + "s";
};
export const fmtFreqMHz = (hz: number | null): string =>
  hz === null ? "—" : (hz / 1e6).toFixed(3) + " MHz";
