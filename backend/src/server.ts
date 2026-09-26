import express, { type Application } from "express";
import cors from "cors";
import { config } from "./config/env.js";
import apiRouter from "./routes/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

export function createServer(): Application {
  const app = express();

  // Basic middleware
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json());

  // Mount API router
  app.use("/api", apiRouter);

  // Centralized error handler (must be last middleware)
  app.use(errorMiddleware);

  return app;
}
