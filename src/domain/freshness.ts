import type { FreshnessStatus } from "./types";

/** TLE age thresholds (hours) */
export const ORBIT_LIVE_MAX_H = 24;
export const ORBIT_DELAYED_MAX_H = 72;

/** Telemetry observation age thresholds (hours) */
export const TLM_LIVE_MAX_H = 1;
export const TLM_DELAYED_MAX_H = 24;

export function ageHours(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3600_000;
}

export function orbitFreshness(tleEpochIso: string | null, now: Date): FreshnessStatus {
  const age = ageHours(tleEpochIso, now);
  if (age === null) return "UNAVAILABLE";
  if (age <= ORBIT_LIVE_MAX_H) return "LIVE";
  if (age <= ORBIT_DELAYED_MAX_H) return "DELAYED";
  return "STALE";
}

export function telemetryFreshness(observedAtIso: string | null, now: Date): FreshnessStatus {
  const age = ageHours(observedAtIso, now);
  if (age === null) return "UNAVAILABLE";
  if (age <= TLM_LIVE_MAX_H) return "LIVE";
  if (age <= TLM_DELAYED_MAX_H) return "DELAYED";
  return "STALE";
}

export function fmtAge(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 0) return "future?";
  if (hours < 1) return Math.round(hours * 60) + "m";
  if (hours < 48) return hours.toFixed(1) + "h";
  return (hours / 24).toFixed(1) + "d";
}
