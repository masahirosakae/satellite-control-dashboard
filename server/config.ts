export interface ServerConfig {
  port: number;
  celestrakBaseUrl: string;
  satnogsDbBaseUrl: string;
  satnogsNetworkBaseUrl: string;
  /** null when not configured — the app must still work */
  satnogsApiToken: string | null;
  cacheTtlS: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const token = (env.SATNOGS_API_TOKEN ?? "").trim();
  return {
    port: Number(env.PORT) > 0 ? Number(env.PORT) : 8787,
    celestrakBaseUrl: stripSlash(env.CELESTRAK_BASE_URL || "https://celestrak.org"),
    satnogsDbBaseUrl: stripSlash(env.SATNOGS_DB_BASE_URL || "https://db.satnogs.org"),
    satnogsNetworkBaseUrl: stripSlash(env.SATNOGS_NETWORK_BASE_URL || "https://network.satnogs.org"),
    satnogsApiToken: token.length > 0 ? token : null,
    cacheTtlS: Number(env.LIVE_DATA_CACHE_TTL_SECONDS) > 0 ? Number(env.LIVE_DATA_CACHE_TTL_SECONDS) : 600,
  };
}

const stripSlash = (u: string): string => u.replace(/\/+$/, "");
