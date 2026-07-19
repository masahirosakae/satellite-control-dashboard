/** Aggregate mission health signals into a static ops checklist. Pure, no I/O, no React. */
import type { GroundStation, OrbitState, ProviderHealth, TelemetrySnapshot } from "./types";
import type { ContactPhaseInfo } from "./contactPhase";
import { ORBIT_LIVE_MAX_H, ORBIT_DELAYED_MAX_H, fmtAge } from "./freshness";

export type ChecklistStatus = "OK" | "WARN" | "FAIL" | "N_A";

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
  telemetry: TelemetrySnapshot;
  health: ProviderHealth[];
  stations: GroundStation[];
  phase: ContactPhaseInfo;
}): ChecklistItem[] {
  const { orbit, telemetry, health, stations, phase } = input;
  const items: ChecklistItem[] = [];

  // 1. orbit-source
  {
    const f = orbit.provenance.freshness;
    const status: ChecklistStatus =
      f === "LIVE" || f === "SIMULATED" || f === "REPLAY" ? "OK" : f === "DELAYED" || f === "STALE" ? "WARN" : "FAIL";
    items.push({
      id: "orbit-source",
      label: "ORBIT SOURCE",
      status,
      detail: orbit.provenance.sourceName + " · " + f,
    });
  }

  // 2. tle-age — reuse freshness.ts's own TLE-age thresholds/formatter rather than re-deriving numbers.
  {
    const hours = orbit.tleAgeHours;
    if (hours === null) {
      items.push({ id: "tle-age", label: "TLE AGE", status: "N_A", detail: "—" });
    } else {
      const status: ChecklistStatus = hours <= ORBIT_LIVE_MAX_H ? "OK" : hours <= ORBIT_DELAYED_MAX_H ? "WARN" : "FAIL";
      items.push({ id: "tle-age", label: "TLE AGE", status, detail: fmtAge(hours) });
    }
  }

  // 3. telemetry
  {
    let status: ChecklistStatus;
    let detail: string;
    switch (telemetry.status) {
      case "OK":
        status = "OK";
        detail = "OK";
        break;
      case "NO_DATA":
        status = "WARN";
        detail = "NO_DATA";
        break;
      case "TOKEN_MISSING":
        status = "WARN";
        detail = "TOKEN_MISSING — an API token is required for this data source";
        break;
      case "ERROR":
      case "UNAVAILABLE":
      default:
        status = "FAIL";
        detail = telemetry.status;
        break;
    }
    if (telemetry.error) detail += " · " + telemetry.error;
    items.push({ id: "telemetry", label: "TELEMETRY", status, detail });
  }

  // 4. providers
  {
    let status: ChecklistStatus;
    if (health.some((h) => h.status === "ERROR")) status = "FAIL";
    else if (health.some((h) => h.status === "DEGRADED" || h.status === "TOKEN_MISSING")) status = "WARN";
    else status = "OK";

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
      status: stations.length > 0 ? "OK" : "FAIL",
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
      items.push({ id: "next-contact", label: "NEXT CONTACT", status: "OK", detail });
    }
  }

  return items;
}
