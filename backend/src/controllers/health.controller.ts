import type { Request, Response } from "express";
import { checkDatabaseConnection } from "../config/database.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const dbStatus = await checkDatabaseConnection();

  res.status(200).json({
    success: true,
    data: {
      status: "healthy",
      service: "orchestrator-backend",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus.connected ? "connected" : "disconnected",
        message: dbStatus.message,
      },
    },
  });
}
