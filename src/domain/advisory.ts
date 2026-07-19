/**
 * Derive operator-facing advisories from mission health signals. Pure, no
 * I/O, no React. Fires ONLY on genuine-degradation conditions — mode
 * theatrics (LIVE/DELAYED/SIMULATED/REPLAY freshness) never raise an
 * advisory, only STALE/UNAVAILABLE and explicit error/token statuses do.
 *
 * Advisories are gated on the request lifecycle (ProviderRequestState) of
 * the underlying provider, not just the data snapshot: while a request is
 * NOT_REQUESTED or still LOADING we don't yet know whether the data is
 * genuinely bad, so nothing is emitted for that domain. Advisory ids encode
 * mode + source + failure reason so acknowledgements never carry across a
 * mode switch, a different source, or a different failure reason.
 */
import type { MissionMode, OrbitState, ProviderHealth, ProviderRequestState, TelemetrySnapshot } from "./types";
import { fmtAge } from "./freshness";

export type AdvisorySeverity = "WARN" | "CRITICAL";

export interface Advisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
}

/** Maps a provider id to the data-product domain it backs, for dedup purposes. */
const PROVIDER_DOMAIN: Record<string, "orbit" | "tlm"> = {
  "celestrak-orbit": "orbit",
  "satnogs-telemetry": "tlm",
};

function reasonSlug(reason: ProviderHealth["failureReason"]): string {
  if (reason === "PARSE_FAILED") return "parse-failed";
  return "fetch-failed";
}

export function deriveAdvisories(input: {
  mode: MissionMode;
  orbit: OrbitState;
  orbitRequest: ProviderRequestState;
  telemetry: TelemetrySnapshot;
  tlmRequest: ProviderRequestState;
  health: ProviderHealth[];
}): Advisory[] {
  const { mode, orbit, orbitRequest, telemetry, tlmRequest, health } = input;
  const items: Advisory[] = [];
  const domainsFired = new Set<"orbit" | "tlm">();

  // ---- orbit ----
  if (orbitRequest === "FAILED") {
    const slug = reasonSlug(
      health.find((h) => h.providerId === "celestrak-orbit")?.failureReason ?? "FETCH_FAILED"
    );
    items.push({
      id: `${mode}:orbit:${slug}`,
      severity: "CRITICAL",
      title: "ORBIT DATA " + (slug === "parse-failed" ? "PARSE FAILED" : "FETCH FAILED"),
      detail: orbit.provenance.sourceName + " · " + (orbit.error ?? "request failed"),
    });
    domainsFired.add("orbit");
  } else if (orbitRequest === "SUCCEEDED") {
    if (orbit.provenance.freshness === "STALE") {
      items.push({
        id: `${mode}:orbit:stale`,
        severity: "WARN",
        title: "ORBIT DATA STALE",
        detail: orbit.provenance.sourceName + " · TLE age " + fmtAge(orbit.tleAgeHours),
      });
      domainsFired.add("orbit");
    }
    // UNAVAILABLE with SUCCEEDED is defensive-only (shouldn't normally
    // happen) and LIVE/DELAYED/SIMULATED/REPLAY are all healthy — neither
    // raises an advisory.
  }
  // NOT_REQUESTED / LOADING: emit nothing for orbit.

  // ---- telemetry ----
  if (tlmRequest === "FAILED") {
    items.push({
      id: `${mode}:tlm:fetch-failed`,
      severity: "CRITICAL",
      title: "TELEMETRY FETCH FAILED",
      detail: telemetry.provenance.sourceName + " · " + (telemetry.error ?? "request failed"),
    });
    domainsFired.add("tlm");
  } else if (tlmRequest === "SUCCEEDED") {
    if (telemetry.status === "TOKEN_MISSING") {
      items.push({
        id: `${mode}:tlm:token-missing`,
        severity: "WARN",
        title: "TELEMETRY TOKEN MISSING",
        detail: "An API token is required for this telemetry source (set SATNOGS_API_TOKEN).",
      });
      domainsFired.add("tlm");
    } else if (telemetry.status === "ERROR") {
      items.push({
        id: `${mode}:tlm:error`,
        severity: "CRITICAL",
        title: "TELEMETRY ERROR",
        detail: telemetry.error ?? "unknown error",
      });
      domainsFired.add("tlm");
    } else if (telemetry.status === "NO_DATA") {
      // not critical — the request succeeded, there's simply nothing yet.
    } else if (telemetry.status === "OK" && telemetry.provenance.freshness === "STALE") {
      items.push({
        id: `${mode}:tlm:stale`,
        severity: "WARN",
        title: "TELEMETRY STALE",
        detail: telemetry.provenance.sourceName + " · " + telemetry.provenance.freshness,
      });
      domainsFired.add("tlm");
    }
    // UNAVAILABLE with SUCCEEDED: defensive-only, emits nothing.
  }
  // NOT_REQUESTED / LOADING: emit nothing for telemetry.

  // ---- providers ----
  for (const h of health) {
    if (h.requestState !== "FAILED") continue;
    const domain = PROVIDER_DOMAIN[h.providerId];
    if (domain && domainsFired.has(domain)) continue; // same root cause already reported

    if (h.status === "ERROR") {
      items.push({
        id: `${mode}:provider:${h.providerId}:error`,
        severity: "CRITICAL",
        title: h.label + " ERROR",
        detail: h.lastError ?? "unknown error",
      });
    } else if (h.status === "TOKEN_MISSING") {
      items.push({
        id: `${mode}:provider:${h.providerId}:token-missing`,
        severity: "WARN",
        title: h.label + " TOKEN MISSING",
        detail: "An API token is required for this provider.",
      });
    }
  }

  const rank: Record<AdvisorySeverity, number> = { CRITICAL: 0, WARN: 1 };
  return [...items].sort((a, b) => {
    const bySeverity = rank[a.severity] - rank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.id.localeCompare(b.id, "en");
  });
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
