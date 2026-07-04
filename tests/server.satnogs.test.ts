import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { loadConfig } from "../server/config";
import type { FetchImpl } from "../server/clients/celestrak";

describe("GET /api/satnogs/telemetry/:noradId", () => {
  it("returns TOKEN_MISSING when no SatNOGS API token is configured", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () => {
      throw new Error("should not be called");
    });
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/telemetry/59112");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("TOKEN_MISSING");
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("sends the Authorization header and normalizes a successful response, never leaking the token", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      SATNOGS_API_TOKEN: "secret123",
    });
    const fakeFetch: FetchImpl = vi.fn(async (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe("Token secret123");
      return new Response(
        JSON.stringify({
          results: [
            {
              timestamp: "2026-07-01T00:00:00Z",
              observer: "X",
              app_source: "network",
              decoded: { vbat: 7.7 },
              frame: "AABB",
            },
          ],
        }),
        { status: 200 }
      );
    });
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/telemetry/59112");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.entries[0].decoded.vbat).toBe(7.7);
    expect(JSON.stringify(res.body)).not.toContain("secret123");
  });

  it("returns NO_DATA for an empty results array", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      SATNOGS_API_TOKEN: "secret123",
    });
    const fakeFetch: FetchImpl = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/telemetry/59112");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("NO_DATA");
  });

  it("returns 502 with status ERROR when the upstream fetch rejects", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      SATNOGS_API_TOKEN: "secret123",
    });
    const fakeFetch: FetchImpl = vi.fn(async () => {
      throw new Error("upstream down");
    });
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/telemetry/59112");
    expect(res.status).toBe(502);
    expect(res.body.status).toBe("ERROR");
  });
});

describe("GET /api/satnogs/observations/:noradId", () => {
  it("normalizes a successful observations response", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: 123,
              station_name: "TEST-GS",
              start: "2026-07-01T00:00:00Z",
              end: "2026-07-01T00:10:00Z",
              observation_frequency: 437025000,
              transmitter_mode: "GMSK",
              status: "good",
              waterfall_status: "with-signal",
            },
          ],
        }),
        { status: 200 }
      )
    );
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/observations/59112");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.observations[0].frequencyHz).toBe(437025000);
    expect(res.body.observations[0].url).toContain("123");
  });

  it("returns NO_DATA for an empty results array", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/observations/59112");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("NO_DATA");
  });

  it("returns 502 with status ERROR when the upstream fetch rejects", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () => {
      throw new Error("upstream down");
    });
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/satnogs/observations/59112");
    expect(res.status).toBe(502);
    expect(res.body.status).toBe("ERROR");
  });
});
