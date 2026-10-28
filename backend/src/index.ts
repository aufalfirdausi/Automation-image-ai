import { createServer } from "./server.js";
import { config } from "./config/env.js";
import { SchedulerService } from "./scheduler/scheduler.service.js";
import { TelegramBotListenerService } from "./services/telegram-listener.service.js";

const app = createServer();
const scheduler = new SchedulerService(undefined, undefined, 5000);
scheduler.start();

const telegramListener = new TelegramBotListenerService();
telegramListener.start();

const server = app.listen(config.port, () => {
  console.log(`[Orchestrator Backend] Server running on http://localhost:${config.port}`);
  console.log(`[Orchestrator Backend] Health check available at http://localhost:${config.port}/api/health`);
  console.log(`[Orchestrator Backend] Scheduler service active (5s tick)`);
});

process.on("SIGINT", () => {
  telegramListener.stop();
  scheduler.stop();
  server.close(() => {
    console.log("[Orchestrator Backend] Server terminated");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  telegramListener.stop();
  scheduler.stop();
  server.close(() => {
    console.log("[Orchestrator Backend] Server terminated");
    process.exit(0);
  });
});
