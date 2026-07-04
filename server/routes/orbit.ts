import { Router } from "express";
import type { OrbitApiResponse } from "../../shared/apiTypes";
import { parseTleText } from "../../shared/tle";
import { fetchGpTle, type FetchImpl } from "../clients/celestrak";
import type { TtlCache } from "../cache";
import type { ServerConfig } from "../config";

export interface OrbitRouterDeps {
  config: ServerConfig;
  fetchImpl: FetchImpl;
  cache: TtlCache<OrbitApiResponse>;
  now?: () => Date;
}

/**
 * GET /api/orbit/:noradId
 * Fetches GP/TLE data from CelesTrak server-side, normalizes it, and caches
 * it. On upstream failure, an old cache entry is served explicitly marked
 * staleCache=true; if there is no cache, a 502 is returned. The client must
 * NEVER silently fall back to simulated data.
 */
export function createOrbitRouter(deps: OrbitRouterDeps): Router {
  const { config, fetchImpl, cache } = deps;
  const now = deps.now ?? (() => new Date());
  const router = Router();

  router.get("/:noradId", async (req, res) => {
    const noradId = Number(req.params.noradId);
    if (!Number.isInteger(noradId) || noradId <= 0 || noradId > 999999) {
      res.status(400).json({ error: "invalid NORAD catalog number" });
      return;
    }
    const key = String(noradId);

    const fresh = cache.getFresh(key);
    if (fresh) {
      res.json(fresh);
      return;
    }

    try {
      const { text, url } = await fetchGpTle(fetchImpl, config.celestrakBaseUrl, noradId);
      const tle = parseTleText(text);
      const payload: OrbitApiResponse = {
        noradId,
        name: tle.name,
        tleLine1: tle.line1,
        tleLine2: tle.line2,
        epoch: tle.epoch,
        fetchedAt: now().toISOString(),
        source: "CelesTrak",
        sourceUrl: url,
        staleCache: false,
        fetchError: null,
      };
      cache.set(key, payload);
      res.json(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown upstream error";
      const old = cache.getAny(key);
      if (old) {
        // Explicit stale-cache fallback: same real data, clearly labeled.
        const stale: OrbitApiResponse = { ...old.value, staleCache: true, fetchError: msg };
        res.json(stale);
        return;
      }
      res.status(502).json({ error: "CelesTrak fetch failed: " + msg });
    }
  });

  return router;
}
