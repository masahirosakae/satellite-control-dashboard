export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const UA = "satellite-control-dashboard/0.2 (educational read-only dashboard)";

export interface CelestrakGpResult {
  text: string;
  url: string;
}

export async function fetchGpTle(
  fetchImpl: FetchImpl,
  baseUrl: string,
  noradId: number
): Promise<CelestrakGpResult> {
  const url = `${baseUrl}/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=TLE`;
  const res = await fetchImpl(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  const text = await res.text();
  if (/no gp data found/i.test(text)) {
    throw new Error(`CelesTrak: no GP data found for NORAD ${noradId}`);
  }
  return { text, url };
}
