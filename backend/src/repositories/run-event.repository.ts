import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getDatabasePool } from "../config/database.js";
import type { NodeExecutionStatus } from "../engine/runner-types.js";
import type { NodeExecutionError } from "../engine/execution-types.js";
import { sanitizePayload } from "../runs/sanitize.js";

export interface RunEventRecord {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  status: NodeExecutionStatus;
  input: unknown | null;
  output: unknown | null;
  error: NodeExecutionError | null;
  branch: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  event_order: number;
  created_at: string;
}

export interface RunEventDto {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: NodeExecutionStatus;
  input: unknown | null;
  output: unknown | null;
  error: NodeExecutionError | null;
  branch: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  eventOrder: number;
  createdAt: string;
}

export interface CreateRunEventParams {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: NodeExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: NodeExecutionError | null;
  branch?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  eventOrder: number;
}

interface RunEventRow extends RowDataPacket {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  status: NodeExecutionStatus;
  input: string | unknown | null;
  output: string | unknown | null;
  error: string | NodeExecutionError | null;
  branch: string | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  duration_ms: number | null;
  event_order: number;
  created_at: string | Date;
}

export class RunEventRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  private parseRow(row: RunEventRow): RunEventRecord {
    const toIso = (val: unknown): string | null => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString();
      return String(val);
    };

    let parsedInput: unknown = null;
    if (row.input !== null && row.input !== undefined) {
      if (typeof row.input === "string") {
        try {
          parsedInput = JSON.parse(row.input);
        } catch {
          parsedInput = row.input;
        }
      } else {
        parsedInput = row.input;
      }
    }

    let parsedOutput: unknown = null;
    if (row.output !== null && row.output !== undefined) {
      if (typeof row.output === "string") {
        try {
          parsedOutput = JSON.parse(row.output);
        } catch {
          parsedOutput = row.output;
        }
      } else {
        parsedOutput = row.output;
      }
    }

    let parsedError: NodeExecutionError | null = null;
    if (row.error) {
      if (typeof row.error === "string") {
        try {
          parsedError = JSON.parse(row.error);
        } catch {
          parsedError = row.error as any;
        }
      } else {
        parsedError = row.error as NodeExecutionError;
      }
    }

    return {
      id: row.id,
      run_id: row.run_id,
      node_id: row.node_id,
      node_type: row.node_type,
      status: row.status,
      input: parsedInput,
      output: parsedOutput,
      error: parsedError,
      branch: row.branch,
      started_at: toIso(row.started_at),
      finished_at: toIso(row.finished_at),
      duration_ms: row.duration_ms !== null ? Number(row.duration_ms) : null,
      event_order: Number(row.event_order),
      created_at: toIso(row.created_at) || new Date().toISOString(),
    };
  }

  async createEvent(params: CreateRunEventParams): Promise<RunEventRecord> {
    const sanitizedInput = params.input !== undefined ? sanitizePayload(params.input) : null;
    const sanitizedOutput = params.output !== undefined ? sanitizePayload(params.output) : null;

    const inputJson = sanitizedInput !== null ? JSON.stringify(sanitizedInput) : null;
    const outputJson = sanitizedOutput !== null ? JSON.stringify(sanitizedOutput) : null;
    const errorJson = params.error ? JSON.stringify(params.error) : null;

    const startedAt = params.startedAt ? new Date(params.startedAt) : null;
    const finishedAt = params.finishedAt ? new Date(params.finishedAt) : null;

    await this.pool.query<ResultSetHeader>(
      `INSERT INTO workflow_run_events 
        (id, run_id, node_id, node_type, status, input, output, error, branch, started_at, finished_at, duration_ms, event_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.id,
        params.runId,
        params.nodeId,
        params.nodeType,
        params.status,
        inputJson,
        outputJson,
        errorJson,
        params.branch || null,
        startedAt,
        finishedAt,
        params.durationMs !== undefined ? params.durationMs : null,
        params.eventOrder,
      ]
    );

    const [rows] = await this.pool.query<RunEventRow[]>(
      "SELECT * FROM workflow_run_events WHERE id = ?",
      [params.id]
    );

    if (rows.length === 0) {
      throw new Error(`Failed to retrieve newly created event '${params.id}'`);
    }

    return this.parseRow(rows[0]);
  }

  async listEventsByRunId(runId: string): Promise<RunEventRecord[]> {
    const [rows] = await this.pool.query<RunEventRow[]>(
      "SELECT * FROM workflow_run_events WHERE run_id = ? ORDER BY event_order ASC, id ASC",
      [runId]
    );

    return rows.map((r) => this.parseRow(r));
  }

  toDto(record: RunEventRecord): RunEventDto {
    return {
      id: record.id,
      runId: record.run_id,
      nodeId: record.node_id,
      nodeType: record.node_type,
      status: record.status,
      input: record.input,
      output: record.output,
      error: record.error,
      branch: record.branch,
      startedAt: record.started_at,
      finishedAt: record.finished_at,
      durationMs: record.duration_ms,
      eventOrder: record.event_order,
      createdAt: record.created_at,
    };
  }
}
