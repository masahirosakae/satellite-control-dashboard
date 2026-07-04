/**
 * Thin, typed wrapper around satellite.js SGP4 propagation.
 * Used in LIVE_READ_ONLY and REPLAY modes (never the simplified sine model).
 */
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  eciToEcf,
  ecfToLookAngles,
  degreesToRadians,
  radiansToDegrees,
  degreesLat,
  degreesLong,
  type SatRec,
  type PositionAndVelocity,
} from "satellite.js";
import type { GeoPoint, LookAngles, OrbitPosition } from "../../domain/types";

export interface ObserverSite {
  lat: number;
  lon: number;
  altM: number;
}

export class Sgp4OrbitEngine {
  readonly satrec: SatRec;

  constructor(line1: string, line2: string) {
    this.satrec = twoline2satrec(line1, line2);
    if (this.satrec.error !== 0) {
      throw new Error("SGP4 initialization failed (satrec error " + this.satrec.error + ")");
    }
  }

  /** Orbital period from mean motion (satrec.no is rad/min). */
  periodMinutes(): number {
    return (2 * Math.PI) / this.satrec.no;
  }

  private propagateSafe(date: Date): PositionAndVelocity | null {
    try {
      const pv = propagate(this.satrec, date) as PositionAndVelocity | null;
      if (!pv || !pv.position || typeof pv.position !== "object") return null;
      return pv;
    } catch {
      return null;
    }
  }

  positionAt(date: Date): OrbitPosition | null {
    const pv = this.propagateSafe(date);
    if (!pv) return null;
    const gmst = gstime(date);
    const geo = eciToGeodetic(pv.position, gmst);
    const v = pv.velocity;
    return {
      lat: degreesLat(geo.latitude),
      lon: degreesLong(geo.longitude),
      altKm: geo.height,
      velocityKmS: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    };
  }

  lookAnglesAt(site: ObserverSite, date: Date): LookAngles | null {
    const pv = this.propagateSafe(date);
    if (!pv) return null;
    const gmst = gstime(date);
    const ecf = eciToEcf(pv.position, gmst);
    const observer = {
      latitude: degreesToRadians(site.lat),
      longitude: degreesToRadians(site.lon),
      height: site.altM / 1000,
    };
    const la = ecfToLookAngles(observer, ecf);
    return {
      azimuthDeg: (radiansToDegrees(la.azimuth) + 360) % 360,
      elevationDeg: radiansToDegrees(la.elevation),
      rangeKm: la.rangeSat,
    };
  }

  /** Sample the ground track from `start` for `durationS` seconds. */
  groundTrack(start: Date, durationS: number, stepS: number): GeoPoint[] {
    const pts: GeoPoint[] = [];
    for (let dt = 0; dt <= durationS; dt += stepS) {
      const p = this.positionAt(new Date(start.getTime() + dt * 1000));
      if (p) pts.push({ lat: p.lat, lon: p.lon });
    }
    return pts;
  }
}
