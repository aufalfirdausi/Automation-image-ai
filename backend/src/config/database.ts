import mysql, { type Pool, type PoolConnection } from "mysql2/promise";
import { config } from "./env.js";

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      waitForConnections: true,
      connectionLimit: config.database.connectionLimit,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export interface DatabaseStatus {
  connected: boolean;
  message: string;
}

export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  let connection: PoolConnection | null = null;
  try {
    const activePool = getDatabasePool();
    connection = await activePool.getConnection();
    await connection.ping();
    return {
      connected: true,
      message: "Database connected successfully",
    };
  } catch (error: unknown) {
    let errorMessage = "Unknown database error";
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    } else if (typeof error === "object" && error !== null && "code" in error) {
      errorMessage = String((error as { code: unknown }).code);
    } else if (typeof error === "string") {
      errorMessage = error;
    }
    return {
      connected: false,
      message: `Database unreachable: ${errorMessage}`,
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
