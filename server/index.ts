import "dotenv/config";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp({ config, serveStatic: process.env.NODE_ENV === "production" });

app.listen(config.port, () => {
  // The token itself is intentionally never printed.
  console.log(`[bff] listening on http://localhost:${config.port}`);
  console.log(`[bff] CelesTrak base: ${config.celestrakBaseUrl}`);
  console.log(`[bff] SatNOGS token configured: ${config.satnogsApiToken !== null}`);
});
