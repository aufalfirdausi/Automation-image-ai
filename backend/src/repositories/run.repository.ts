import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDatabasePool } from "../config/database.js";
import type { Workflow } from "../engine/types.js";
import type { NodeExecutionError } from "../engine/execution-types.js";
import type { RunRecord, RunStatus, RunTriggerType, CreateRunParams, RunDto, RunFilterOptions } from "../runs/types.js";
import { assertRunTransition } from "../runs/state-machine.js";

interface RunRow extends RowDataPacket {
  id: string;
  workflow_id: string;
  workflow_version: number;
  workflow_snapshot: string | Workflow;
  status: RunStatus;
  trigger_type: RunTriggerType;
  idempotency_key: string | null;
  error: string | NodeExecutionError | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export class RunRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  private parseRow(row: RunRow): RunRecord {
    const snapshot =
      typeof row.workflow_snapshot === "string"
        ? (JSON.parse(row.workflow_snapshot) as Workflow)
        : (row.workflow_snapshot as Workflow);

    let parsedError: NodeExecutionError | null = null;
    if (row.error) {
      parsedError =
        typeof row.error === "string"
          ? (JSON.parse(row.error) as NodeExecutionError)
          : (row.error as NodeExecutionError);
    }

    const toIsoString = (val: unknown): string | null => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString();
      return String(val);
    };

    return {
      id: row.id,
      workflow_id: row.workflow_id,
      workflow_version: row.workflow_version,
      workflow_snapshot: snapshot,
      status: row.status,
      trigger_type: row.trigger_type,
      idempotency_key: row.idempotency_key,
      error: parsedError,
      created_at: toIsoString(row.created_at) || new Date().toISOString(),
      started_at: toIsoString(row.started_at),
      finished_at: toIsoString(row.finished_at),
    };
  }

  async createRun(params: CreateRunParams): Promise<RunRecord> {
    const snapshotJson = JSON.stringify(params.workflowSnapshot);
    const triggerType = params.triggerType || "manual";
    const idempotencyKey = params.idempotencyKey || null;

    await this.pool.query<ResultSetHeader>(
      `INSERT INTO workflow_runs 
        (id, workflow_id, workflow_version, workflow_snapshot, status, trigger_type, idempotency_key)
       VALUES (?, ?, ?, ?, 'requested', ?, ?)`,
      [
        params.id,
        params.workflowId,
        params.workflowVersion,
        snapshotJson,
        triggerType,
        idempotencyKey,
      ]
    );

    const created = await this.getRunById(params.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created run '${params.id}'`);
    }
    return created;
  }

  async getRunById(id: string): Promise<RunRecord | null> {
    const [rows] = await this.pool.query<RunRow[]>(
      "SELECT * FROM workflow_runs WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.parseRow(rows[0]);
  }

  async getRunByIdempotencyKey(
    workflowId: string,
    idempotencyKey: string
  ): Promise<RunRecord | null> {
    const [rows] = await this.pool.query<RunRow[]>(
      "SELECT * FROM workflow_runs WHERE workflow_id = ? AND idempotency_key = ?",
      [workflowId, idempotencyKey]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.parseRow(rows[0]);
  }

  async updateStatus(
    id: string,
    newStatus: RunStatus,
    options?: {
      startedAt?: string;
      finishedAt?: string;
      error?: NodeExecutionError | null;
    }
  ): Promise<RunRecord> {
    const current = await this.getRunById(id);
    if (!current) {
      throw new Error(`Run '${id}' not found`);
    }

    // Validate state machine transition
    assertRunTransition(current.status, newStatus);

    const updates: string[] = ["status = ?"];
    const params: unknown[] = [newStatus];

    if (options?.startedAt !== undefined) {
      updates.push("started_at = ?");
      params.push(options.startedAt ? new Date(options.startedAt) : null);
    }

    if (options?.finishedAt !== undefined) {
      updates.push("finished_at = ?");
      params.push(options.finishedAt ? new Date(options.finishedAt) : null);
    }

    if (options?.error !== undefined) {
      updates.push("error = ?");
      params.push(options.error ? JSON.stringify(options.error) : null);
    }

    params.push(id);

    await this.pool.query<ResultSetHeader>(
      `UPDATE workflow_runs SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const updated = await this.getRunById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated run '${id}'`);
    }
    return updated;
  }

  async listRuns(filter: RunFilterOptions = {}): Promise<{ runs: RunRecord[]; total: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filter.workflowId) {
      whereClauses.push("workflow_id = ?");
      params.push(filter.workflowId);
    }

    if (filter.status) {
      whereClauses.push("status = ?");
      params.push(filter.status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM workflow_runs ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await this.pool.query<RunRow[]>(
      `SELECT * FROM workflow_runs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      runs: rows.map((r) => this.parseRow(r)),
      total,
    };
  }

  toDto(record: RunRecord): RunDto {
    return {
      id: record.id,
      workflowId: record.workflow_id,
      workflowVersion: record.workflow_version,
      status: record.status,
      triggerType: record.trigger_type,
      idempotencyKey: record.idempotency_key,
      error: record.error,
      createdAt: record.created_at,
      startedAt: record.started_at,
      finishedAt: record.finished_at,
    };
  }

  async deleteRuns(workflowId?: string): Promise<number> {
    if (workflowId && workflowId.trim().length > 0) {
      const [result] = await this.pool.query<ResultSetHeader>(
        "DELETE FROM workflow_runs WHERE workflow_id = ?",
        [workflowId.trim()]
      );
      return Number(result.affectedRows || 0);
    } else {
      const [result] = await this.pool.query<ResultSetHeader>(
        "DELETE FROM workflow_runs"
      );
      return Number(result.affectedRows || 0);
    }
  }
}
