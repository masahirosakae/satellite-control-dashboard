/**
 * Read-only public observation metadata from SatNOGS Network (via BFF).
 */
import type { Observation, ObservationSet, ProviderHealth } from "../../domain/types";
import type { ObservationsApiResponse } from "../../../shared/apiTypes";
import type { MissionApi } from "../api/missionApi";
import type { ProviderEventSink } from "./CelesTrakOrbitProvider";
import { unavailableProvenance } from "./SatelliteDataProvider";

export class SatNogsObservationProvider {
  readonly id = "satnogs-observations";
  readonly label = "SatNOGS Network Observations";

  private resp: ObservationsApiResponse | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;
  private lastSuccessAt: string | null = null;

  constructor(
    private api: MissionApi,
    private noradId: number,
    private onEvent: ProviderEventSink = () => {}
  ) {}

  async refresh(now: Date): Promise<void> {
    try {
      const resp = await this.api.getObservations(this.noradId);
      this.resp = resp;
      if (resp.status === "ERROR") {
        this.lastError = resp.error ?? "SatNOGS Network error";
        this.lastErrorAt = now.toISOString();
        this.onEvent("ERROR", "OBS", `provider request failed — ${this.lastError}`);
      } else {
        this.lastError = null;
        this.lastSuccessAt = now.toISOString();
        this.onEvent(
          "INFO",
          "OBS",
          resp.status === "NO_DATA"
            ? "SatNOGS: no recent observations for this satellite"
            : `observations fetched (${resp.observations.length})`
        );
      }
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : "observations fetch failed";
      this.lastErrorAt = now.toISOString();
      this.onEvent("ERROR", "OBS", `provider request failed — ${this.lastError}`);
    }
  }

  getRecentObservations(): ObservationSet {
    if (!this.resp) {
      return {
        provenance: unavailableProvenance("LIVE_READ_ONLY", "satnogs-network", "SatNOGS Network"),
        status: "UNAVAILABLE",
        observations: [],
        error: this.lastError,
      };
    }
    const r = this.resp;
    const observations: Observation[] = r.observations.map((o) => ({
      id: o.id,
      stationName: o.stationName ?? "unknown station",
      start: o.start,
      end: o.end,
      frequencyHz: o.frequencyHz,
      transmitterMode: o.transmitterMode,
      status: o.status ?? "unknown",
      url: o.url,
    }));
    return {
      provenance: {
        source: "satnogs-network",
        sourceName: r.source,
        sourceUrl: r.sourceUrl,
        observedAt: observations[0]?.start ?? null,
        fetchedAt: r.fetchedAt,
        dataMode: "LIVE_READ_ONLY",
        freshness: r.status === "OK" ? "DELAYED" : "UNAVAILABLE",
        isSimulated: false,
        hasRawPayload: false,
      },
      status: r.status === "ERROR" ? "ERROR" : r.status,
      observations,
      error: r.error,
    };
  }

  getProviderHealth(): ProviderHealth {
    let status: ProviderHealth["status"] = "IDLE";
    if (this.resp?.status === "OK" || this.resp?.status === "NO_DATA") status = "OK";
    if (this.lastError) status = "ERROR";
    return {
      providerId: this.id,
      label: this.label,
      status,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      detail: this.resp?.status === "NO_DATA" ? "no observations available" : null,
    };
  }
}
