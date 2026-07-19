/**
 * Aggregate mission health signals into a static ops checklist. Pure, no
 * I/O, no React.
 *
 * Statuses are gated on the request lifecycle (ProviderRequestState) of the
 * underlying provider, mirroring domain/advisory.ts: while a request is
 * NOT_REQUESTED or still LOADING we don't yet know whether the data is
 * genuinely good or bad, so the item reads PENDING / CHECKING rather than
 * FAIL. This keeps the checklist from flashing false FAILs during normal
 * startup / mode-switch loading windows. Freshness thresholds (LIVE /
 * DELAYED / STALE) are a separate axis from the request lifecycle and are
 * never conflated with it.
 */
import type { GroundStation, OrbitState, ProviderHealth, ProviderRequestState, TelemetrySnapshot } from "./types";
import type { ContactPhaseInfo } from "./contactPhase";
import { ORBIT_LIVE_MAX_H, ORBIT_DELAYED_MAX_H, fmtAge } from "./freshness";

export type ChecklistStatus =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "CHECKING"
  | "PENDING"
  | "CONFIG_REQUIRED"
  | "INFO"
  | "N_A";

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail: string;
}

function fmtDurationMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? h + "h " + p2(m) + "m" : p2(m) + "m " + p2(ss) + "s";
}

/** Fixed display order for provider-status counts in the "DATA PROVIDERS" detail string. */
const PROVIDER_STATUS_ORDER: ProviderHealth["status"][] = ["OK", "IDLE", "DEGRADED", "TOKEN_MISSING", "ERROR"];

export function buildOpsChecklist(input: {
  orbit: OrbitState;
  orbitRequest: ProviderRequestState;
  telemetry: TelemetrySnapshot;
  tlmRequest: ProviderRequestState;
  health: ProviderHealth[];
  stations: GroundStation[];
  phase: ContactPhaseInfo;
}): ChecklistItem[] {
  const { orbit, orbitRequest, telemetry, tlmRequest, health, stations, phase } = input;
  const items: ChecklistItem[] = [];

  // 1. orbit-source
  {
    let status: ChecklistStatus;
    let detail: string;
    if (orbitRequest === "NOT_REQUESTED") {
      status = "PENDING";
      detail = "not requested yet";
    } else if (orbitRequest === "LOADING") {
      status = "CHECKING";
      detail = "request in progress";
    } else if (orbitRequest === "FAILED") {
      status = "FAIL";
      detail = orbit.provenance.sourceName + " · " + (orbit.error ?? "request failed");
    } else {
      // SUCCEEDED
      const f = orbit.provenance.freshness;
      status =
        f === "LIVE" || f === "SIMULATED" || f === "REPLAY"
          ? "PASS"
          : f === "DELAYED" || f === "STALE"
            ? "WARN"
            : "N_A"; // UNAVAILABLE with SUCCEEDED is defensive-only
      detail = orbit.provenance.sourceName + " · " + f;
    }
    items.push({ id: "orbit-source", label: "ORBIT SOURCE", status, detail });
  }

  // 2. tle-age — reuse freshness.ts's own TLE-age thresholds/formatter rather than re-deriving numbers.
  {
    let status: ChecklistStatus;
    let detail: string;
    if (orbitRequest === "NOT_REQUESTED") {
      status = "PENDING";
      detail = "not requested yet";
    } else if (orbitRequest === "LOADING") {
      status = "CHECKING";
      detail = "request in progress";
    } else {
      const hours = orbit.tleAgeHours;
      if (hours === null) {
        status = "N_A";
        detail = "—";
      } else {
        status = hours <= ORBIT_LIVE_MAX_H ? "PASS" : hours <= ORBIT_DELAYED_MAX_H ? "WARN" : "FAIL";
        detail = fmtAge(hours);
      }
    }
    items.push({ id: "tle-age", label: "TLE AGE", status, detail });
  }

  // 3. telemetry
  {
    let status: ChecklistStatus;
    let detail: string;
    if (tlmRequest === "NOT_REQUESTED") {
      status = "PENDING";
      detail = "not requested yet";
    } else if (tlmRequest === "LOADING") {
      status = "CHECKING";
      detail = "request in progress";
    } else if (tlmRequest === "FAILED") {
      status = "FAIL";
      detail = telemetry.provenance.sourceName + " · " + (telemetry.error ?? "request failed");
    } else {
      // SUCCEEDED
      switch (telemetry.status) {
        case "OK":
          status = "PASS";
          detail = "OK";
          break;
        case "NO_DATA":
          status = "INFO";
          detail = "NO_DATA — request succeeded, nothing decoded yet";
          break;
        case "TOKEN_MISSING":
          status = "CONFIG_REQUIRED";
          detail = "An API token is required for this data source (set SATNOGS_API_TOKEN on the server).";
          break;
        case "ERROR":
          status = "FAIL";
          detail = telemetry.error ?? "ERROR";
          break;
        case "UNAVAILABLE":
        default:
          status = "N_A"; // defensive-only
          detail = telemetry.status;
          break;
      }
      if (telemetry.error && telemetry.status !== "ERROR") detail += " · " + telemetry.error;
    }
    items.push({ id: "telemetry", label: "TELEMETRY", status, detail });
  }

  // 4. providers — precedence: FAILED request > TOKEN_MISSING status > CHECKING (NOT_REQUESTED/LOADING) > PASS.
  {
    let status: ChecklistStatus;
    if (health.some((h) => h.requestState === "FAILED")) status = "FAIL";
    else if (health.some((h) => h.status === "TOKEN_MISSING")) status = "CONFIG_REQUIRED";
    else if (health.some((h) => h.requestState === "NOT_REQUESTED" || h.requestState === "LOADING")) status = "CHECKING";
    else status = "PASS";

    const counts = new Map<ProviderHealth["status"], number>();
    for (const h of health) counts.set(h.status, (counts.get(h.status) ?? 0) + 1);
    const countParts = PROVIDER_STATUS_ORDER.filter((s) => counts.has(s)).map((s) => counts.get(s) + " " + s);
    const failing = health.filter((h) => h.status === "ERROR" || h.status === "DEGRADED" || h.status === "TOKEN_MISSING");
    const detail =
      (countParts.length > 0 ? countParts.join(" / ") : "no providers") +
      (failing.length > 0 ? ": " + failing.map((h) => h.label).join(", ") : "");
    items.push({ id: "providers", label: "DATA PROVIDERS", status, detail });
  }

  // 5. stations
  {
    items.push({
      id: "stations",
      label: "GROUND STATIONS",
      status: stations.length > 0 ? "PASS" : "FAIL",
      detail: stations.length + (stations.length === 1 ? " station" : " stations"),
    });
  }

  // 6. next-contact
  {
    if (phase.phase === "NO_WINDOW") {
      items.push({ id: "next-contact", label: "NEXT CONTACT", status: "WARN", detail: "no contact window in horizon" });
    } else {
      const detail =
        phase.phase === "CONTACT"
          ? "in contact"
          : phase.tToAosMs !== null
            ? "AOS in " + fmtDurationMs(phase.tToAosMs)
            : "—";
      items.push({ id: "next-contact", label: "NEXT CONTACT", status: "PASS", detail });
    }
  }

  return items;
}
