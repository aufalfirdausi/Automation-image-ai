import type { Workflow } from "../engine/types.js";
import type { NodeExecutionError } from "../engine/execution-types.js";

/**
 * Persisted run lifecycle states.
 */
export type RunStatus =
  | "requested"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/**
 * Trigger mechanism initiating the run.
 */
export type RunTriggerType = "manual" | "api" | "schedule" | "webhook";

/**
 * Raw MySQL run record from `workflow_runs` table.
 */
export interface RunRecord {
  id: string;
  workflow_id: string;
  workflow_version: number;
  workflow_snapshot: Workflow;
  status: RunStatus;
  trigger_type: RunTriggerType;
  idempotency_key: string | null;
  error: NodeExecutionError | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/**
 * Parameters for creating a new workflow run.
 */
export interface CreateRunParams {
  id: string;
  workflowId: string;
  workflowVersion: number;
  workflowSnapshot: Workflow;
  triggerType?: RunTriggerType;
  idempotencyKey?: string | null;
}

/**
 * Public DTO returned by API endpoints.
 */
export interface RunDto {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  triggerType: RunTriggerType;
  idempotencyKey: string | null;
  error: NodeExecutionError | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Filter options for querying run lists.
 */
export interface RunFilterOptions {
  workflowId?: string;
  status?: RunStatus;
  page?: number;
  limit?: number;
}

/**
 * Paginated response envelope for runs list.
 */
export interface PaginatedRunsDto {
  runs: RunDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
