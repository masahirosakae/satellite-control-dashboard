import type { FetchImpl } from "./celestrak";

const UA = "satellite-control-dashboard/0.2 (educational read-only dashboard)";

export interface SatnogsFetchResult {
  json: unknown;
  url: string;
}

/** Public observation metadata from SatNOGS Network (no token required). */
export async function fetchObservations(
  fetchImpl: FetchImpl,
  baseUrl: string,
  noradId: number
): Promise<SatnogsFetchResult> {
  const url = `${baseUrl}/api/observations/?satellite__norad_cat_id=${noradId}&format=json`;
  const res = await fetchImpl(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`SatNOGS Network HTTP ${res.status}`);
  return { json: await res.json(), url };
}

/**
 * Decoded telemetry frames from SatNOGS DB. Requires an API token which is
 * used ONLY here, server-side. The token must never appear in responses,
 * logs or error messages.
 */
export async function fetchTelemetry(
  fetchImpl: FetchImpl,
  baseUrl: string,
  token: string,
  noradId: number
): Promise<SatnogsFetchResult> {
  const url = `${baseUrl}/api/telemetry/?satellite=${noradId}&format=json`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": UA, Authorization: `Token ${token}` },
  });
  if (!res.ok) throw new Error(`SatNOGS DB HTTP ${res.status}`);
  return { json: await res.json(), url };
}
