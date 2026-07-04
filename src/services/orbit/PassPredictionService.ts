/**
 * Real pass prediction based on SGP4 look angles.
 * AOS/LOS are defined at the station's elevation mask crossing
 * (default 10°), refined by bisection to sub-second accuracy.
 */
import type { GroundStation, PassPrediction } from "../../domain/types";
import type { Sgp4OrbitEngine } from "./Sgp4OrbitEngine";

export const DEFAULT_MIN_ELEVATION_DEG = 10;

export interface PassPredictionOptions {
  horizonS?: number;
  coarseStepS?: number;
  maxPasses?: number;
}

function bisectCrossing(
  elAt: (tMs: number) => number,
  loMs: number,
  hiMs: number,
  mask: number,
  rising: boolean
): number {
  let lo = loMs;
  let hi = hiMs;
  for (let i = 0; i < 24 && hi - lo > 250; i++) {
    const mid = (lo + hi) / 2;
    const above = elAt(mid) >= mask;
    if (above === rising) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function predictPassesForStation(
  engine: Sgp4OrbitEngine,
  station: GroundStation,
  start: Date,
  opts: PassPredictionOptions = {}
): PassPrediction[] {
  const horizonS = opts.horizonS ?? 24 * 3600;
  const stepS = opts.coarseStepS ?? 30;
  const maxPasses = opts.maxPasses ?? 50;
  const mask = Number.isFinite(station.minElevationDeg)
    ? station.minElevationDeg
    : DEFAULT_MIN_ELEVATION_DEG;

  const site = { lat: station.lat, lon: station.lon, altM: station.altM };
  const elAt = (tMs: number): number =>
    engine.lookAnglesAt(site, new Date(tMs))?.elevationDeg ?? -90;

  const startMs = start.getTime();
  const endMs = startMs + horizonS * 1000;
  const passes: PassPrediction[] = [];

  let prevMs = startMs;
  let prevAbove = elAt(startMs) >= mask;
  let aosMs: number | null = prevAbove ? startMs : null;

  for (let tMs = startMs + stepS * 1000; tMs <= endMs && passes.length < maxPasses; tMs += stepS * 1000) {
    const above = elAt(tMs) >= mask;
    if (above && !prevAbove) {
      aosMs = bisectCrossing(elAt, prevMs, tMs, mask, true);
    } else if (!above && prevAbove && aosMs !== null) {
      const losMs = bisectCrossing(elAt, prevMs, tMs, mask, false);
      passes.push(buildPass(engine, station, elAt, aosMs, losMs));
      aosMs = null;
    }
    prevAbove = above;
    prevMs = tMs;
  }
  // A pass still in progress at the end of the horizon is dropped rather
  // than reported with a fake LOS.
  return passes;
}

function buildPass(
  engine: Sgp4OrbitEngine,
  station: GroundStation,
  elAt: (tMs: number) => number,
  aosMs: number,
  losMs: number
): PassPrediction {
  const site = { lat: station.lat, lon: station.lon, altM: station.altM };
  let maxEl = -90;
  let maxElMs = aosMs;
  const fineStep = Math.max(1000, Math.floor((losMs - aosMs) / 200));
  for (let t = aosMs; t <= losMs; t += fineStep) {
    const el = elAt(t);
    if (el > maxEl) {
      maxEl = el;
      maxElMs = t;
    }
  }
  const aosLook = engine.lookAnglesAt(site, new Date(aosMs));
  const losLook = engine.lookAnglesAt(site, new Date(losMs));
  return {
    stationId: station.id,
    aos: new Date(aosMs).toISOString(),
    los: new Date(losMs).toISOString(),
    durationS: Math.round((losMs - aosMs) / 1000),
    maxElevationDeg: +maxEl.toFixed(1),
    maxElevationAt: new Date(maxElMs).toISOString(),
    aosAzimuthDeg: +(aosLook?.azimuthDeg ?? 0).toFixed(1),
    losAzimuthDeg: +(losLook?.azimuthDeg ?? 0).toFixed(1),
  };
}

export function predictPasses(
  engine: Sgp4OrbitEngine,
  stations: GroundStation[],
  start: Date,
  opts: PassPredictionOptions = {}
): PassPrediction[] {
  const all = stations.flatMap((s) => predictPassesForStation(engine, s, start, opts));
  all.sort((a, b) => Date.parse(a.aos) - Date.parse(b.aos));
  return all;
}
