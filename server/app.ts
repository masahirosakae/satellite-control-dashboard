import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrbitApiResponse, ObservationsApiResponse, TelemetryApiResponse } from "../shared/apiTypes";
import { TtlCache } from "./cache";
import type { ServerConfig } from "./config";
import type { FetchImpl } from "./clients/celestrak";
import { createOrbitRouter } from "./routes/orbit";
import { createSatnogsRouter } from "./routes/satnogs";

export interface AppDeps {
  config: ServerConfig;
  fetchImpl?: FetchImpl;
  serveStatic?: boolean;
}

export function createApp(deps: AppDeps): express.Express {
  const { config } = deps;
  const fetchImpl: FetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));

  const app = express();
  app.disable("x-powered-by");

  const ttlMs = config.cacheTtlS * 1000;
  const orbitCache = new TtlCache<OrbitApiResponse>(ttlMs);
  const obsCache = new TtlCache<ObservationsApiResponse>(ttlMs);
  const tlmCache = new TtlCache<TelemetryApiResponse>(ttlMs);

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      // boolean flag only — the token value itself never leaves the server
      satnogsTokenConfigured: config.satnogsApiToken !== null,
    });
  });

  app.use("/api/orbit", createOrbitRouter({ config, fetchImpl, cache: orbitCache }));
  app.use("/api/satnogs", createSatnogsRouter({ config, fetchImpl, obsCache, tlmCache }));

  if (deps.serveStatic) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const dist = path.resolve(dir, "..", "dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  return app;
}
