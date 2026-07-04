import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { loadConfig } from "../server/config";
import type { FetchImpl } from "../server/clients/celestrak";
import fixture from "../src/fixtures/sonate2-replay.json";

const tleText = `${fixture.tle.name}\n${fixture.tle.line1}\n${fixture.tle.line2}`;

describe("GET /api/orbit/:noradId", () => {
  it("returns normalized orbit data from CelesTrak", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      LIVE_DATA_CACHE_TTL_SECONDS: "600",
    });
    const fakeFetch: FetchImpl = vi.fn(async () => new Response(tleText, { status: 200 }));
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/orbit/59112");

    expect(res.status).toBe(200);
    expect(res.body.tleLine1).toBe(fixture.tle.line1);
    expect(res.body.tleLine2).toBe(fixture.tle.line2);
    expect(res.body.epoch).toBe(fixture.tle.epoch);
    expect(res.body.source).toBe("CelesTrak");
    expect(res.body.staleCache).toBe(false);
  });

  it("returns 502 with an error body when the upstream fetch fails and there is no cache", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      LIVE_DATA_CACHE_TTL_SECONDS: "600",
    });
    const failingFetch: FetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const app = createApp({ config, fetchImpl: failingFetch });

    const res = await request(app).get("/api/orbit/59112");

    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });

  it("falls back to a stale cache entry (staleCache=true, fetchError set) when a later fetch fails", async () => {
    const config = loadConfig({
      CELESTRAK_BASE_URL: "https://celestrak.test",
      LIVE_DATA_CACHE_TTL_SECONDS: "0.001",
    });
    let callCount = 0;
    const flakyFetch: FetchImpl = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return new Response(tleText, { status: 200 });
      throw new Error("upstream unreachable");
    });
    const app = createApp({ config, fetchImpl: flakyFetch });

    const first = await request(app).get("/api/orbit/59112");
    expect(first.status).toBe(200);
    expect(first.body.staleCache).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await request(app).get("/api/orbit/59112");
    expect(second.status).toBe(200);
    expect(second.body.staleCache).toBe(true);
    expect(second.body.fetchError).toBeTruthy();
    expect(second.body.tleLine1).toBe(fixture.tle.line1);
  });

  it("returns 400 for a non-numeric NORAD id", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () => new Response(tleText, { status: 200 }));
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/orbit/abc");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/health", () => {
  it("reports ok:true and satnogsTokenConfigured:false when no token is set", async () => {
    const config = loadConfig({ CELESTRAK_BASE_URL: "https://celestrak.test" });
    const fakeFetch: FetchImpl = vi.fn(async () => new Response(tleText, { status: 200 }));
    const app = createApp({ config, fetchImpl: fakeFetch });

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, satnogsTokenConfigured: false });
  });
});
