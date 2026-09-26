import type { Request, Response, NextFunction } from "express";
import { config } from "../config/env.js";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");

  // In production, avoid leaking internal error stack traces
  const isDev = config.nodeEnv === "development";
  if (isDev && statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.path}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || "Internal server error",
      code: errorCode,
    },
  });
}
