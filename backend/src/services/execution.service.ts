import type { Workflow } from "../engine/types.js";
import { validateWorkflow } from "../engine/validate-workflow.js";
import { executeWorkflow } from "../engine/runner.js";
import { defaultNodeRegistry, validateNodeConfig } from "../nodes/index.js";
import { WorkflowRepository } from "../repositories/workflow.repository.js";
import { RunRepository } from "../repositories/run.repository.js";
import { RunEventRepository, type RunEventDto } from "../repositories/run-event.repository.js";
import type { RunDto, RunTriggerType, RunFilterOptions, PaginatedRunsDto } from "../runs/types.js";

export class WorkflowNotFoundError extends Error {
  readonly code = "WORKFLOW_NOT_FOUND";
  constructor(workflowId: string) {
    super(`Workflow '${workflowId}' not found`);
    this.name = "WorkflowNotFoundError";
  }
}

export class InvalidWorkflowError extends Error {
  readonly code = "INVALID_WORKFLOW";
  readonly details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "InvalidWorkflowError";
    this.details = details;
  }
}

export class NodeHandlerNotFoundError extends Error {
  readonly code = "HANDLER_NOT_FOUND";
  constructor(nodeId: string, nodeType: string) {
    super(`No handler registered for node '${nodeId}' of type '${nodeType}'`);
    this.name = "NodeHandlerNotFoundError";
  }
}

export class InvalidNodeConfigError extends Error {
  readonly code = "INVALID_NODE_CONFIG";
  readonly details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = "InvalidNodeConfigError";
    this.details = details;
  }
}

import type { RetryPolicy } from "../engine/runner-types.js";

export interface StartRunParams {
  workflowId: string;
  idempotencyKey?: string | null;
  triggerType?: RunTriggerType;
  triggerPayload?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  retryPolicy?: RetryPolicy;
}

export type RunDetailDto = RunDto & { events: RunEventDto[] };

function isDuplicateIdempotencyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

export class ExecutionService {
  private workflowRepo: WorkflowRepository;
  private runRepo: RunRepository;
  private runEventRepo: RunEventRepository;

  constructor(
    workflowRepo?: WorkflowRepository,
    runRepo?: RunRepository,
    runEventRepo?: RunEventRepository
  ) {
    this.workflowRepo = workflowRepo || new WorkflowRepository();
    this.runRepo = runRepo || new RunRepository();
    this.runEventRepo = runEventRepo || new RunEventRepository();
  }

  /**
   * Starts a workflow run with pre-execution validation gates and idempotency protection.
   */
  async startRun(params: StartRunParams): Promise<{ run: RunDto; idempotentReplay: boolean }> {
    const { workflowId, idempotencyKey, triggerType = "manual" } = params;

    // 1. Idempotency Check
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const existing = await this.runRepo.getRunByIdempotencyKey(workflowId, idempotencyKey.trim());
      if (existing) {
        return {
          run: this.runRepo.toDto(existing),
          idempotentReplay: true,
        };
      }
    }

    // 2. Pre-execution Validation Gate A: Workflow Existence
    const workflowRecord = await this.workflowRepo.getWorkflowById(workflowId);
    if (!workflowRecord) {
      throw new WorkflowNotFoundError(workflowId);
    }

    // Clone snapshot to strictly isolate from future modifications
    const snapshot: Workflow = JSON.parse(JSON.stringify(workflowRecord.graph_definition));

    // 3. Pre-execution Validation Gate B: Graph DAG Validation
    const graphValidation = validateWorkflow(snapshot);
    if (!graphValidation.isValid) {
      throw new InvalidWorkflowError(
        `Cannot execute invalid workflow DAG: ${graphValidation.errors.join("; ")}`,
        graphValidation.errors
      );
    }

    // 4. Pre-execution Validation Gate C: Node Manifest & Handler Check
    for (const node of snapshot.nodes) {
      const manifest = defaultNodeRegistry.getManifest(node.type);
      if (!manifest) {
        throw new NodeHandlerNotFoundError(node.id, node.type);
      }

      // 5. Pre-execution Validation Gate D: Node Configuration Validation
      const configValidation = validateNodeConfig(manifest, node.config);
      if (!configValidation.isValid) {
        const errorMsg = configValidation.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
        throw new InvalidNodeConfigError(
          `Invalid configuration for node '${node.id}': ${errorMsg}`,
          configValidation.errors
        );
      }
    }

    // 6. Generate Unique Run ID & Persist Initial Run Record
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
      await this.runRepo.createRun({
        id: runId,
        workflowId: workflowRecord.id,
        workflowVersion: workflowRecord.version,
        workflowSnapshot: snapshot,
        triggerType,
        idempotencyKey: idempotencyKey?.trim() || null,
      });
    } catch (error) {
      if (idempotencyKey && isDuplicateIdempotencyError(error)) {
        const existing = await this.runRepo.getRunByIdempotencyKey(workflowId, idempotencyKey.trim());
        if (existing) {
          return {
            run: this.runRepo.toDto(existing),
            idempotentReplay: true,
          };
        }
      }
      throw error;
    }

    // 7. Transition to 'running'
    const startedAt = new Date().toISOString();
    await this.runRepo.updateStatus(runId, "running", { startedAt });

    // 8. Execute via Phase 2 Engine with Event Tracking
    let eventOrder = 0;
    try {
      const summary = await executeWorkflow(
        snapshot,
        defaultNodeRegistry.toHandlerProvider(),
        {
          executionId: runId,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
          retryPolicy: params.retryPolicy,
          metadata: {
            triggerPayload: params.triggerPayload,
          },
          onNodeEvent: async (event) => {
            eventOrder++;
            const eventId = `evt_${runId}_${eventOrder}_${event.nodeId}`;
            try {
              await this.runEventRepo.createEvent({
                id: eventId,
                runId,
                nodeId: event.nodeId,
                nodeType: event.nodeType,
                status: event.status,
                input: event.input,
                output: event.output,
                error: event.error,
                branch: event.branch,
                startedAt: event.startedAt,
                finishedAt: event.finishedAt,
                durationMs: event.durationMs,
                eventOrder,
              });
            } catch (err) {
              console.error(
                `[ExecutionService] Failed to persist event for run '${runId}' node '${event.nodeId}':`,
                err
              );
            }
          },
        }
      );

      const finishedAt = new Date().toISOString();

      if (summary.status === "completed") {
        const completedRecord = await this.runRepo.updateStatus(runId, "succeeded", {
          finishedAt,
        });
        return {
          run: this.runRepo.toDto(completedRecord),
          idempotentReplay: false,
        };
      } else {
        // Engine reported failure or cancellation
        const isCancelled = summary.error?.code === "EXECUTION_ABORTED";
        const finalStatus = isCancelled ? "cancelled" : "failed";
        const failedRecord = await this.runRepo.updateStatus(runId, finalStatus, {
          finishedAt,
          error: summary.error ?? {
            code: "NODE_EXECUTION_FAILED",
            message: "Workflow execution failed",
          },
        });
        return {
          run: this.runRepo.toDto(failedRecord),
          idempotentReplay: false,
        };
      }
    } catch (unhandledException) {
      // Emergency catch if an unhandled error escapes
      const finishedAt = new Date().toISOString();
      const message =
        unhandledException instanceof Error ? unhandledException.message : String(unhandledException);
      const failedRecord = await this.runRepo.updateStatus(runId, "failed", {
        finishedAt,
        error: {
          code: "NODE_EXECUTION_EXCEPTION",
          message,
        },
      });
      return {
        run: this.runRepo.toDto(failedRecord),
        idempotentReplay: false,
      };
    }
  }

  /**
   * Retrieves run status, metadata, and full event trace by ID.
   */
  async getRun(runId: string): Promise<RunDetailDto | null> {
    const record = await this.runRepo.getRunById(runId);
    if (!record) {
      return null;
    }

    const events = await this.runEventRepo.listEventsByRunId(runId);
    const runDto = this.runRepo.toDto(record);

    return {
      ...runDto,
      events: events.map((e) => this.runEventRepo.toDto(e)),
    };
  }

  /**
   * Lists runs with pagination and filtering.
   */
  async listRuns(filter: RunFilterOptions = {}): Promise<PaginatedRunsDto> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const { runs, total } = await this.runRepo.listRuns(filter);
    const totalPages = Math.ceil(total / limit);

    return {
      runs: runs.map((r) => this.runRepo.toDto(r)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Clears workflow execution history.
   * If workflowId is provided, clears runs only for that workflow.
   * If omitted, clears all runs globally.
   */
  async clearRuns(workflowId?: string): Promise<{ deletedCount: number }> {
    const deletedCount = await this.runRepo.deleteRuns(workflowId);
    return { deletedCount };
  }
}
