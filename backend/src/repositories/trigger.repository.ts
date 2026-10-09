import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDatabasePool } from "../config/database.js";
import type {
  TriggerRecord,
  CreateTriggerParams,
  TriggerDto,
  TriggerType,
  TriggerConfig,
} from "../triggers/types.js";

interface TriggerRow extends RowDataPacket {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: string | TriggerConfig;
  enabled: number | boolean;
  last_triggered_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class TriggerRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  private mapRow(row: TriggerRow): TriggerRecord {
    const config =
      typeof row.config === "string" ? JSON.parse(row.config) : row.config;

    return {
      id: row.id,
      workflow_id: row.workflow_id,
      type: row.type,
      config,
      enabled: Boolean(row.enabled),
      last_triggered_at: row.last_triggered_at
        ? new Date(row.last_triggered_at).toISOString()
        : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  toDto(record: TriggerRecord): TriggerDto {
    return {
      id: record.id,
      workflowId: record.workflow_id,
      type: record.type,
      config: record.config,
      enabled: record.enabled,
      lastTriggeredAt: record.last_triggered_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  async createTrigger(params: CreateTriggerParams): Promise<TriggerRecord> {
    const id =
      params.id ||
      `trig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const enabled = params.enabled !== undefined ? params.enabled : true;
    const configJson = JSON.stringify(params.config);

    const query = `
      INSERT INTO triggers (id, workflow_id, type, config, enabled)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.pool.execute(query, [
      id,
      params.workflowId,
      params.type,
      configJson,
      enabled ? 1 : 0,
    ]);

    const created = await this.getTriggerById(id);
    if (!created) {
      throw new Error(`Failed to retrieve trigger after insert: ${id}`);
    }
    return created;
  }

  async getTriggerById(id: string): Promise<TriggerRecord | null> {
    const query = `SELECT * FROM triggers WHERE id = ? LIMIT 1`;
    const [rows] = await this.pool.execute<TriggerRow[]>(query, [id]);
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async getTriggerByWebhookPath(path: string): Promise<TriggerRecord | null> {
    const query = `
      SELECT * FROM triggers
      WHERE type = 'webhook' AND JSON_UNQUOTE(JSON_EXTRACT(config, '$.path')) = ?
      LIMIT 1
    `;
    const [rows] = await this.pool.execute<TriggerRow[]>(query, [path]);
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async listTriggers(filter?: {
    workflowId?: string;
    type?: TriggerType;
    enabled?: boolean;
  }): Promise<TriggerRecord[]> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (filter?.workflowId) {
      conditions.push("workflow_id = ?");
      values.push(filter.workflowId);
    }
    if (filter?.type) {
      conditions.push("type = ?");
      values.push(filter.type);
    }
    if (filter?.enabled !== undefined) {
      conditions.push("enabled = ?");
      values.push(filter.enabled ? 1 : 0);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT * FROM triggers ${whereClause} ORDER BY created_at DESC`;

    const [rows] = await this.pool.execute<TriggerRow[]>(query, values);
    return rows.map((r) => this.mapRow(r));
  }

  async updateLastTriggeredAt(id: string, timestamp: Date = new Date()): Promise<void> {
    const query = `UPDATE triggers SET last_triggered_at = ? WHERE id = ?`;
    await this.pool.execute(query, [timestamp, id]);
  }

  async updateTrigger(
    id: string,
    updates: { config?: TriggerConfig; enabled?: boolean }
  ): Promise<TriggerRecord | null> {
    const assignments: string[] = [];
    const values: (string | number)[] = [];

    if (updates.config !== undefined) {
      assignments.push("config = ?");
      values.push(JSON.stringify(updates.config));
    }
    if (updates.enabled !== undefined) {
      assignments.push("enabled = ?");
      values.push(updates.enabled ? 1 : 0);
    }

    if (assignments.length === 0) {
      return this.getTriggerById(id);
    }

    values.push(id);
    const query = `UPDATE triggers SET ${assignments.join(", ")} WHERE id = ?`;
    await this.pool.execute(query, values);
    return this.getTriggerById(id);
  }

  async deleteTrigger(id: string): Promise<boolean> {
    const query = `DELETE FROM triggers WHERE id = ?`;
    const [result] = await this.pool.execute<ResultSetHeader>(query, [id]);
    return result.affectedRows > 0;
  }
}
