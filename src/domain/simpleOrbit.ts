/**
 * Simplified sine-wave orbit model.
 *
 * SIMULATED mode ONLY. This is intentionally NOT an SGP4 propagator and must
 * never be used to render a real satellite: LIVE_READ_ONLY and REPLAY modes
 * use services/orbit/Sgp4OrbitEngine instead.
 */
import { wrapLon, type LatLon } from "./geo";

export const SIM_ORBIT_PERIOD_S = 5580; // 93 min
export const SIM_INCLINATION_DEG = 51.6;
export const SIM_COMM_RANGE_KM = 2600;

const EARTH_ROT = 360 / 86400; // deg/s
const ORBIT_LON_RATE = 360 / SIM_ORBIT_PERIOD_S;
const LON0 = -30;

export function simSatPosition(t: number): LatLon {
  const phase = (2 * Math.PI * t) / SIM_ORBIT_PERIOD_S;
  const lat = SIM_INCLINATION_DEG * Math.sin(phase);
  const lon = wrapLon(LON0 + (ORBIT_LON_RATE - EARTH_ROT) * t);
  return { lat, lon };
}

export const simElevationDeg = (dKm: number): number =>
  Math.max(0, 90 * (1 - dKm / SIM_COMM_RANGE_KM));
