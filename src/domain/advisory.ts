/**
 * Derive operator-facing advisories from mission health signals. Pure, no
 * I/O, no React. Fires ONLY on genuine-degradation conditions — mode
 * theatrics (LIVE/DELAYED/SIMULATED/REPLAY freshness) never raise an
 * advisory, only STALE/UNAVAILABLE and explicit error/token statuses do.
 */
import type { OrbitState, ProviderHealth, TelemetrySnapshot } from "./types";
import { fmtAge } from "./freshness";

export type AdvisorySeverity = "WARN" | "CRITICAL";

export interface Advisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
}

export function deriveAdvisories(input: {
  orbit: OrbitState;
  telemetry: TelemetrySnapshot;
  health: ProviderHealth[];
}): Advisory[] {
  const { orbit, telemetry, health } = input;
  const items: Advisory[] = [];

  // orbit
  if (orbit.provenance.freshness === "STALE") {
    items.push({
      id: "orbit-stale",
      severity: "WARN",
      title: "ORBIT DATA STALE",
      detail: orbit.provenance.sourceName + " · TLE age " + fmtAge(orbit.tleAgeHours),
    });
  }
  if (orbit.provenance.freshness === "UNAVAILABLE") {
    items.push({
      id: "orbit-unavailable",
      severity: "CRITICAL",
      title: "ORBIT DATA UNAVAILABLE",
      detail: orbit.provenance.sourceName + " · TLE age " + fmtAge(orbit.tleAgeHours),
    });
  }

  // telemetry freshness — suppressed if telemetry.status already covers the
  // same condition via tlm-unavailable below (avoid double-firing).
  const tlmUnavailableFromStatus = telemetry.status === "UNAVAILABLE";
  if (telemetry.provenance.freshness === "STALE" && !tlmUnavailableFromStatus) {
    items.push({
      id: "tlm-stale",
      severity: "WARN",
      title: "TELEMETRY STALE",
      detail: telemetry.provenance.sourceName + " · " + telemetry.provenance.freshness,
    });
  }

  // telemetry status
  if (telemetry.status === "TOKEN_MISSING") {
    items.push({
      id: "tlm-token-missing",
      severity: "WARN",
      title: "TELEMETRY TOKEN MISSING",
      detail: "An API token is required for this telemetry source.",
    });
  }
  if (telemetry.status === "ERROR") {
    items.push({
      id: "tlm-error",
      severity: "CRITICAL",
      title: "TELEMETRY ERROR",
      detail: telemetry.error ?? "unknown error",
    });
  }
  if (telemetry.status === "UNAVAILABLE") {
    items.push({
      id: "tlm-unavailable",
      severity: "CRITICAL",
      title: "TELEMETRY UNAVAILABLE",
      detail: telemetry.error ?? telemetry.provenance.sourceName,
    });
  }

  // providers
  for (const h of health) {
    if (h.status === "ERROR") {
      items.push({
        id: "provider-error:" + h.providerId,
        severity: "CRITICAL",
        title: h.label + " ERROR",
        detail: h.lastError ?? "unknown error",
      });
    }
    if (h.status === "TOKEN_MISSING") {
      items.push({
        id: "provider-token:" + h.providerId,
        severity: "WARN",
        title: h.label + " TOKEN MISSING",
        detail: "An API token is required for this provider.",
      });
    }
  }

  const rank: Record<AdvisorySeverity, number> = { CRITICAL: 0, WARN: 1 };
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * Intersect acknowledged ids with currently-active ids: acks for conditions
 * that have cleared are dropped, so if the same condition recurs later it
 * re-raises as a fresh (unacked) advisory.
 */
export function reconcileAcks(acked: ReadonlySet<string>, currentIds: string[]): Set<string> {
  const current = new Set(currentIds);
  const result = new Set<string>();
  for (const id of acked) {
    if (current.has(id)) result.add(id);
  }
  return result;
}
