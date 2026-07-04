import { Router } from "express";
import type {
  ObservationDto,
  ObservationsApiResponse,
  TelemetryApiResponse,
  TelemetryEntryDto,
} from "../../shared/apiTypes";
import { fetchObservations, fetchTelemetry } from "../clients/satnogs";
import type { FetchImpl } from "../clients/celestrak";
import type { TtlCache } from "../cache";
import type { ServerConfig } from "../config";

export interface SatnogsRouterDeps {
  config: ServerConfig;
  fetchImpl: FetchImpl;
  obsCache: TtlCache<ObservationsApiResponse>;
  tlmCache: TtlCache<TelemetryApiResponse>;
  now?: () => Date;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Defensive normalization of a SatNOGS Network observation object. Field
 * names follow the public API but we never assume all of them exist.
 */
function normalizeObservation(o: unknown): ObservationDto {
  const r = (typeof o === "object" && o !== null ? o : {}) as Record<string, unknown>;
  const id = typeof r.id === "number" || typeof r.id === "string" ? r.id : "?";
  const freqHz = num(r.observation_frequency) ?? num(r.transmitter_downlink_low);
  return {
    id,
    stationName: str(r.station_name) ?? (num(r.ground_station) !== null ? `Station #${r.ground_station}` : null),
    start: str(r.start),
    end: str(r.end),
    frequencyHz: freqHz,
    transmitterMode: str(r.transmitter_mode) ?? str(r.mode),
    status: str(r.status) ?? str(r.vetted_status),
    waterfallStatus: str(r.waterfall_status),
    url: id !== "?" ? `https://network.satnogs.org/observations/${id}/` : null,
  };
}

/**
 * Defensive normalization of a SatNOGS DB telemetry entry.
 * `decoded` may be an object of decoded fields, a string (decoder/dashboard
 * pointer) or absent depending on the satellite — handle all cases.
 */
function normalizeTelemetryEntry(e: unknown): TelemetryEntryDto {
  const r = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
  const decodedObj =
    typeof r.decoded === "object" && r.decoded !== null && !Array.isArray(r.decoded)
      ? (r.decoded as Record<string, unknown>)
      : null;
  return {
    timestamp: str(r.timestamp),
    observer: str(r.observer),
    appSource: str(r.app_source),
    decoded: decodedObj,
    frameHex: str(r.frame),
    decoderName: typeof r.decoded === "string" ? r.decoded : str(r.schema),
  };
}

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  // Some DRF deployments paginate: { count, next, previous, results: [...] }
  if (typeof json === "object" && json !== null && Array.isArray((json as Record<string, unknown>).results)) {
    return (json as { results: unknown[] }).results;
  }
  return [];
}

export function createSatnogsRouter(deps: SatnogsRouterDeps): Router {
  const { config, fetchImpl, obsCache, tlmCache } = deps;
  const now = deps.now ?? (() => new Date());
  const router = Router();

  router.get("/observations/:noradId", async (req, res) => {
    const noradId = Number(req.params.noradId);
    if (!Number.isInteger(noradId) || noradId <= 0) {
      res.status(400).json({ error: "invalid NORAD catalog number" });
      return;
    }
    const key = String(noradId);
    const fresh = obsCache.getFresh(key);
    if (fresh) {
      res.json(fresh);
      return;
    }
    try {
      const { json, url } = await fetchObservations(fetchImpl, config.satnogsNetworkBaseUrl, noradId);
      const observations = asArray(json).slice(0, 25).map(normalizeObservation);
      const payload: ObservationsApiResponse = {
        // NO_DATA means "the network really has no observations", which is
        // different from ERROR ("we could not ask the network").
        status: observations.length > 0 ? "OK" : "NO_DATA",
        fetchedAt: now().toISOString(),
        source: "SatNOGS Network",
        sourceUrl: url,
        observations,
        error: null,
      };
      obsCache.set(key, payload);
      res.json(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown upstream error";
      const body: ObservationsApiResponse = {
        status: "ERROR",
        fetchedAt: now().toISOString(),
        source: "SatNOGS Network",
        sourceUrl: config.satnogsNetworkBaseUrl,
        observations: [],
        error: msg,
      };
      res.status(502).json(body);
    }
  });

  router.get("/telemetry/:noradId", async (req, res) => {
    const noradId = Number(req.params.noradId);
    if (!Number.isInteger(noradId) || noradId <= 0) {
      res.status(400).json({ error: "invalid NORAD catalog number" });
      return;
    }
    if (!config.satnogsApiToken) {
      const body: TelemetryApiResponse = {
        status: "TOKEN_MISSING",
        fetchedAt: now().toISOString(),
        source: "SatNOGS DB",
        sourceUrl: config.satnogsDbBaseUrl,
        entries: [],
        error: null,
      };
      res.json(body);
      return;
    }
    const key = String(noradId);
    const fresh = tlmCache.getFresh(key);
    if (fresh) {
      res.json(fresh);
      return;
    }
    try {
      const { json, url } = await fetchTelemetry(
        fetchImpl,
        config.satnogsDbBaseUrl,
        config.satnogsApiToken,
        noradId
      );
      const entries = asArray(json).slice(0, 25).map(normalizeTelemetryEntry);
      const payload: TelemetryApiResponse = {
        status: entries.length > 0 ? "OK" : "NO_DATA",
        fetchedAt: now().toISOString(),
        source: "SatNOGS DB",
        sourceUrl: url,
        entries,
        error: null,
      };
      tlmCache.set(key, payload);
      res.json(payload);
    } catch (e) {
      // Never include the token in error output; upstream errors are
      // status-code based so this message cannot contain headers.
      const msg = e instanceof Error ? e.message : "unknown upstream error";
      const body: TelemetryApiResponse = {
        status: "ERROR",
        fetchedAt: now().toISOString(),
        source: "SatNOGS DB",
        sourceUrl: config.satnogsDbBaseUrl,
        entries: [],
        error: msg,
      };
      res.status(502).json(body);
    }
  });

  return router;
}
