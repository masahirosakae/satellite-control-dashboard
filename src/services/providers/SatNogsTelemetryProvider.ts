/**
 * Decoded telemetry from SatNOGS DB (via BFF; token stays server-side).
 * Field names are decoder-specific — everything goes through the Known
 * Field Mapping Layer, unmapped fields are preserved and shown as-is.
 */
import type { ProviderHealth, ProviderRequestState, TelemetrySnapshot } from "../../domain/types";
import type { TelemetryApiResponse, TelemetryEntryDto } from "../../../shared/apiTypes";
import { telemetryFreshness } from "../../domain/freshness";
import { mapTelemetryFields } from "../../domain/telemetryMapping";
import type { MissionApi } from "../api/missionApi";
import type { ProviderEventSink } from "./CelesTrakOrbitProvider";
import { unavailableProvenance } from "./SatelliteDataProvider";

export class SatNogsTelemetryProvider {
  readonly id = "satnogs-telemetry";
  readonly label = "SatNOGS DB Telemetry";

  private resp: TelemetryApiResponse | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private tokenMissingLogged = false;
  private requestState: ProviderRequestState = "NOT_REQUESTED";
  private failureReason: "FETCH_FAILED" | "PARSE_FAILED" | null = null;

  constructor(
    private api: MissionApi,
    private noradId: number,
    private onEvent: ProviderEventSink = () => {}
  ) {}

  async refresh(now: Date): Promise<void> {
    this.requestState = "LOADING";
    try {
      const resp = await this.api.getTelemetry(this.noradId);
      this.resp = resp;
      if (resp.status === "TOKEN_MISSING") {
        if (!this.tokenMissingLogged) {
          this.onEvent("WARN", "TLM", "SatNOGS token missing — telemetry disabled (set SATNOGS_API_TOKEN)");
          this.tokenMissingLogged = true;
        }
        this.lastError = null;
        this.requestState = "SUCCEEDED";
        this.failureReason = null;
      } else if (resp.status === "ERROR") {
        this.lastError = resp.error ?? "SatNOGS DB error";
        this.lastErrorAt = now.toISOString();
        this.requestState = "FAILED";
        this.failureReason = "FETCH_FAILED";
        this.onEvent("ERROR", "TLM", `provider request failed — ${this.lastError}`);
      } else {
        this.lastError = null;
        this.lastSuccessAt = now.toISOString();
        this.requestState = "SUCCEEDED";
        this.failureReason = null;
        this.onEvent(
          "INFO",
          "TLM",
          resp.status === "NO_DATA"
            ? "telemetry unavailable — SatNOGS DB has no frames for this satellite"
            : `telemetry fetched (${resp.entries.length} frames)`
        );
      }
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : "telemetry fetch failed";
      this.lastErrorAt = now.toISOString();
      this.requestState = "FAILED";
      this.failureReason = "FETCH_FAILED";
      this.onEvent("ERROR", "TLM", `provider request failed — ${this.lastError}`);
    }
  }

  /** Newest entry, preferring entries that actually carry decoded fields. */
  private latestEntry(): TelemetryEntryDto | null {
    const entries = this.resp?.entries ?? [];
    if (entries.length === 0) return null;
    const sorted = [...entries].sort(
      (a, b) => (Date.parse(b.timestamp ?? "") || 0) - (Date.parse(a.timestamp ?? "") || 0)
    );
    return sorted.find((e) => e.decoded && Object.keys(e.decoded).length > 0) ?? sorted[0];
  }

  getTelemetry(now: Date = new Date()): TelemetrySnapshot {
    if (!this.resp) {
      return {
        provenance: unavailableProvenance("LIVE_READ_ONLY", "satnogs-db", "SatNOGS DB"),
        status: "UNAVAILABLE",
        observedAt: null,
        decoder: null,
        fields: [],
        rawFrame: null,
        error: this.lastError,
      };
    }
    const r = this.resp;
    if (r.status !== "OK") {
      return {
        provenance: unavailableProvenance("LIVE_READ_ONLY", "satnogs-db", "SatNOGS DB"),
        status: r.status,
        observedAt: null,
        decoder: null,
        fields: [],
        rawFrame: null,
        error: r.error,
      };
    }
    const entry = this.latestEntry();
    const { fields } = mapTelemetryFields(entry?.decoded ?? null);
    return {
      provenance: {
        source: "satnogs-db",
        sourceName: r.source,
        sourceUrl: r.sourceUrl,
        observedAt: entry?.timestamp ?? null,
        fetchedAt: r.fetchedAt,
        dataMode: "LIVE_READ_ONLY",
        freshness: telemetryFreshness(entry?.timestamp ?? null, now),
        isSimulated: false,
        hasRawPayload: entry?.frameHex !== null,
      },
      status: "OK",
      observedAt: entry?.timestamp ?? null,
      decoder: entry?.decoderName ?? null,
      fields,
      rawFrame: entry?.frameHex ?? null,
      error: null,
    };
  }

  getEntries(): TelemetryEntryDto[] {
    return this.resp?.entries ?? [];
  }

  getProviderHealth(): ProviderHealth {
    let status: ProviderHealth["status"] = "IDLE";
    if (this.resp) {
      if (this.resp.status === "TOKEN_MISSING") status = "TOKEN_MISSING";
      else if (this.resp.status === "ERROR" || this.lastError) status = "ERROR";
      else status = "OK";
    } else if (this.lastError) status = "ERROR";
    return {
      providerId: this.id,
      label: this.label,
      status,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      detail:
        this.resp?.status === "TOKEN_MISSING"
          ? "Telemetry token is not configured"
          : this.resp?.status === "NO_DATA"
            ? "no decoded frames available"
            : null,
      requestState: this.requestState,
      failureReason: this.failureReason,
    };
  }
}
