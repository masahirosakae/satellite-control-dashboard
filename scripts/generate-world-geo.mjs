#!/usr/bin/env node
/**
 * Generates src/assets/world-110m.json — a lightweight, repo-committed
 * static asset of world coastline polylines derived from the public-domain
 * Natural Earth dataset (via the `world-atlas` npm package, 110m
 * resolution) and decoded with `topojson-client`.
 *
 * This script is a build-time/dev-time tool only. The generated asset is
 * committed to the repository and imported locally at runtime (no fetch,
 * no network access at runtime) — see src/components/map/WorldMap.tsx.
 *
 * Output format: a bare JSON array of polylines, each polyline an array of
 * [lon, lat] pairs, rounded to one decimal place (~11km resolution at the
 * equator) to keep the asset small while remaining visually faithful at the
 * dashboard's map scale (720x360 SVG viewbox).
 *
 * Usage: node scripts/generate-world-geo.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feature } from "topojson-client";
import land110m from "world-atlas/land-110m.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "src", "assets", "world-110m.json");

/** Round to 1 decimal place. */
const q = (n) => Math.round(n * 10) / 10;

function main() {
  const geojson = feature(land110m, land110m.objects.land);

  /** @type {number[][][]} */
  const polylines = [];

  for (const geometry of geojson.features) {
    const { type, coordinates } = geometry.geometry;
    const rings = type === "Polygon" ? coordinates : type === "MultiPolygon" ? coordinates.flat() : [];
    for (const ring of rings) {
      const quantized = ring.map(([lon, lat]) => [q(lon), q(lat)]);
      // Drop consecutive duplicate points introduced by quantization.
      const dedup = [];
      for (const pt of quantized) {
        const prev = dedup[dedup.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) dedup.push(pt);
      }
      if (dedup.length > 1) polylines.push(dedup);
    }
  }

  const json = JSON.stringify(polylines);
  writeFileSync(OUT_PATH, json);

  const sizeKb = (Buffer.byteLength(json, "utf8") / 1024).toFixed(1);
  console.log(`Wrote ${polylines.length} coastline polylines to ${OUT_PATH} (${sizeKb} KB)`);
}

main();
