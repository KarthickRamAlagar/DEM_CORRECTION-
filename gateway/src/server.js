import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const cfg = loadConfig();
const { app, cache } = await createApp(cfg);
// listens on this computer only unless BIND_HOST says otherwise; NGINX (patch 8c) is the one door to the network
const server = app.listen(cfg.PORT, cfg.BIND_HOST, () => {
  console.log(`Gateway on http://${cfg.BIND_HOST}:${cfg.PORT}  ->  ${cfg.UPSTREAM_URL}  | cache: ${cache.kind()} | monitoring: ${cfg.monitorOn ? "on (secret route)" : "off"}`);
});
const stop = async () => { server.close(); await cache.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
