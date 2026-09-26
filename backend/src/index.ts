import { createServer } from "./server.js";
import { config } from "./config/env.js";

const app = createServer();

const server = app.listen(config.port, () => {
  console.log(`[Orchestrator Backend] Server running on http://localhost:${config.port}`);
  console.log(`[Orchestrator Backend] Health check available at http://localhost:${config.port}/api/health`);
});

process.on("SIGINT", () => {
  server.close(() => {
    console.log("[Orchestrator Backend] Server terminated");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("[Orchestrator Backend] Server terminated");
    process.exit(0);
  });
});
