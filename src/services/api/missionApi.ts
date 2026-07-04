/**
 * Client for our own BFF (server/). The browser never calls CelesTrak or
 * SatNOGS directly, and never holds any API token.
 */
import type {
  OrbitApiResponse,
  ObservationsApiResponse,
  TelemetryApiResponse,
} from "../../../shared/apiTypes";

export class MissionApi {
  constructor(private baseUrl: string = "") {}

  async getOrbit(noradId: number): Promise<OrbitApiResponse> {
    const res = await fetch(`${this.baseUrl}/api/orbit/${noradId}`);
    const body = (await res.json().catch(() => null)) as OrbitApiResponse | { error?: string } | null;
    if (!res.ok || !body || !("tleLine1" in body)) {
      const msg = body && "error" in body && body.error ? body.error : `orbit API HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  async getObservations(noradId: number): Promise<ObservationsApiResponse> {
    const res = await fetch(`${this.baseUrl}/api/satnogs/observations/${noradId}`);
    const body = (await res.json().catch(() => null)) as ObservationsApiResponse | null;
    if (!body || !("status" in body)) throw new Error(`observations API HTTP ${res.status}`);
    return body;
  }

  async getTelemetry(noradId: number): Promise<TelemetryApiResponse> {
    const res = await fetch(`${this.baseUrl}/api/satnogs/telemetry/${noradId}`);
    const body = (await res.json().catch(() => null)) as TelemetryApiResponse | null;
    if (!body || !("status" in body)) throw new Error(`telemetry API HTTP ${res.status}`);
    return body;
  }
}
