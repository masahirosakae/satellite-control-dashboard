/**
 * Ground station persistence (localStorage).
 *
 * The default stations below are well-known public/institutional sites used
 * purely as demo samples. User-added stations come only from explicit user
 * input and stay in the browser's localStorage — they are never sent to any
 * external service.
 */
import type { GroundStation } from "../domain/types";
import { DEFAULT_MIN_ELEVATION_DEG } from "../services/orbit/PassPredictionService";

const STORAGE_KEY = "satdash.groundStations.v1";

export const DEFAULT_STATIONS: GroundStation[] = [
  { id: "GS1", name: "UCHINOURA", lat: 31.25, lon: 131.08, altM: 220, minElevationDeg: 10, isSample: true },
  { id: "GS2", name: "SVALBARD", lat: 78.23, lon: 15.39, altM: 450, minElevationDeg: 10, isSample: true },
  { id: "GS3", name: "SANTIAGO", lat: -33.45, lon: -70.67, altM: 700, minElevationDeg: 10, isSample: true },
  { id: "GS4", name: "FAIRBANKS", lat: 64.86, lon: -147.85, altM: 130, minElevationDeg: 10, isSample: true },
];

function sanitize(s: unknown): GroundStation | null {
  if (typeof s !== "object" || s === null) return null;
  const o = s as Record<string, unknown>;
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return {
    id: typeof o.id === "string" && o.id ? o.id : "GS-" + Math.random().toString(36).slice(2, 8),
    name: typeof o.name === "string" && o.name ? o.name.slice(0, 32) : "STATION",
    lat,
    lon,
    altM: Number.isFinite(Number(o.altM)) ? Number(o.altM) : 0,
    minElevationDeg: Number.isFinite(Number(o.minElevationDeg))
      ? Math.min(89, Math.max(0, Number(o.minElevationDeg)))
      : DEFAULT_MIN_ELEVATION_DEG,
    isSample: o.isSample === true,
  };
}

export function loadStations(storage: Pick<Storage, "getItem"> | null = defaultStorage()): GroundStation[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATIONS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_STATIONS;
    const out = parsed.map(sanitize).filter((s): s is GroundStation => s !== null);
    return out.length > 0 ? out : DEFAULT_STATIONS;
  } catch {
    return DEFAULT_STATIONS;
  }
}

export function saveStations(
  stations: GroundStation[],
  storage: Pick<Storage, "setItem"> | null = defaultStorage()
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(stations));
  } catch {
    // storage may be unavailable (private mode) — non-fatal
  }
}

function defaultStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}
