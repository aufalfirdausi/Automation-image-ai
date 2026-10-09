import fs from "node:fs/promises";
import path from "node:path";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getDatabasePool } from "../config/database.js";

async function findMigrationsDir(): Promise<string> {
  const candidates = [
    typeof __dirname !== "undefined" ? __dirname : "",
    typeof __dirname !== "undefined" ? path.resolve(__dirname, "../../src/migrations") : "",
    path.resolve(process.cwd(), "src/migrations"),
    path.resolve(process.cwd(), "backend/src/migrations"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const files = await fs.readdir(candidate);
      if (files.some((f) => f.endsWith(".sql"))) {
        return candidate;
      }
    } catch {
      // continue
    }
  }

  throw new Error("Migrations directory containing .sql files could not be located");
}

interface MigrationRow extends RowDataPacket {
  name: string;
}

/**
 * Lightweight migration runner executing pending SQL migration files in sequence.
 */
export async function runMigrations(targetPool?: Pool): Promise<string[]> {
  const pool = targetPool || getDatabasePool();

  // 1. Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Fetch already executed migrations
  const [rows] = await pool.query<MigrationRow[]>(
    "SELECT name FROM schema_migrations ORDER BY name ASC"
  );
  const executedSet = new Set(rows.map((r) => r.name));

  // 3. Read migration files from directory
  const migrationsDir = await findMigrationsDir();
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const newlyExecuted: string[] = [];

  for (const file of sqlFiles) {
    if (!executedSet.has(file)) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = await fs.readFile(filePath, "utf-8");

      // Split statements by semicolon if needed, or execute directly
      const cleanSql = sqlContent.trim();
      if (cleanSql) {
        await pool.query(cleanSql);
      }

      await pool.query(
        "INSERT IGNORE INTO schema_migrations (name) VALUES (?)",
        [file]
      );
      newlyExecuted.push(file);
    }
  }

  return newlyExecuted;
}
