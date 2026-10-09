import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow } from "../src/engine/runner.js";
import type { Workflow } from "../src/engine/types.js";
import type { NodeHandler } from "../src/engine/execution-types.js";
import { ExecutionService } from "../src/services/execution.service.js";
import { WorkflowRepository, type WorkflowRecord } from "../src/repositories/workflow.repository.js";
import { RunRepository } from "../src/repositories/run.repository.js";
import { RunEventRepository, type CreateRunEventParams, type RunEventRecord } from "../src/repositories/run-event.repository.js";
import { registerCoreNodes } from "../src/nodes/index.js";
import type { RunRecord, RunStatus, CreateRunParams } from "../src/runs/types.js";

class InMemoryWorkflowRepository extends WorkflowRepository {
  private workflows = new Map<string, WorkflowRecord>();

  setWorkflow(record: WorkflowRecord) {
    this.workflows.set(record.id, record);
  }

  override async getWorkflowById(id: string): Promise<WorkflowRecord | null> {
    return this.workflows.get(id) || null;
  }
}

class InMemoryRunRepository extends RunRepository {
  private runs = new Map<string, RunRecord>();

  override async createRun(params: CreateRunParams): Promise<RunRecord> {
    const record: RunRecord = {
      id: params.id,
      workflow_id: params.workflowId,
      workflow_version: params.workflowVersion,
      workflow_snapshot: params.workflowSnapshot,
      status: "requested",
      trigger_type: params.triggerType || "manual",
      idempotency_key: params.idempotencyKey || null,
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
    };
    this.runs.set(params.id, record);
    return record;
  }

  override async getRunById(id: string): Promise<RunRecord | null> {
    return this.runs.get(id) || null;
  }

  override async updateStatus(
    id: string,
    toStatus: RunStatus,
    options?: { startedAt?: string; finishedAt?: string; error?: any }
  ): Promise<RunRecord> {
    const run = this.runs.get(id);
    if (!run) throw new Error("Run not found");
    const updated: RunRecord = {
      ...run,
      status: toStatus,
      started_at: options?.startedAt || run.started_at,
      finished_at: options?.finishedAt || run.finished_at,
      error: options?.error || run.error,
    };
    this.runs.set(id, updated);
    return updated;
  }
}

class InMemoryRunEventRepository extends RunEventRepository {
  private events = new Map<string, RunEventRecord[]>();

  override async createEvent(params: CreateRunEventParams): Promise<RunEventRecord> {
    const record: RunEventRecord = {
      id: params.id,
      run_id: params.runId,
      node_id: params.nodeId,
      node_type: params.nodeType,
      status: params.status,
      input: params.input,
      output: params.output,
      error: params.error,
      duration_ms: params.durationMs || 0,
      event_order: params.eventOrder,
      created_at: new Date().toISOString(),
    };
    const list = this.events.get(params.runId) || [];
    list.push(record);
    this.events.set(params.runId, list);
    return record;
  }
}

describe("Phase 5.4: Execution Reliability (Timeout, Cancellation, Retry)", () => {
  it("terminates execution with EXECUTION_TIMEOUT when execution exceeds timeoutMs", async () => {
    const workflow: Workflow = {
      id: "wf_timeout",
      name: "Timeout Test Workflow",
      nodes: [
        { id: "step1", type: "slow_node", config: {} },
        { id: "step2", type: "fast_node", config: {} },
      ],
      edges: [{ source: "step1", target: "step2" }],
    };

    const handlers: Record<string, NodeHandler> = {
      slow_node: {
        async execute() {
          await new Promise((r) => setTimeout(r, 60));
          return { success: true, output: "done" };
        },
      },
      fast_node: {
        async execute() {
          return { success: true, output: "fast" };
        },
      },
    };

    const startedAt = Date.now();
    const summary = await executeWorkflow(workflow, handlers, { timeoutMs: 30 });

    assert.equal(summary.status, "failed");
    assert.equal(summary.error?.code, "EXECUTION_TIMEOUT");
    assert.equal(summary.nodeStates["step1"], "failed");
    assert.equal(summary.nodeStates["step2"], "pending");
    assert.ok(Date.now() - startedAt < 55, "workflow should return before the slow handler finishes");
  });

  it("cooperatively aborts execution with EXECUTION_ABORTED when AbortSignal is triggered", async () => {
    const abortController = new AbortController();

    const workflow: Workflow = {
      id: "wf_cancel",
      name: "Cancel Test Workflow",
      nodes: [
        { id: "step1", type: "cancelable_node", config: {} },
        { id: "step2", type: "never_runs", config: {} },
      ],
      edges: [{ source: "step1", target: "step2" }],
    };

    const handlers: Record<string, NodeHandler> = {
      cancelable_node: {
        async execute() {
          abortController.abort();
          return { success: true, output: "aborted_during_run" };
        },
      },
      never_runs: {
        async execute() {
          return { success: true, output: "should_not_run" };
        },
      },
    };

    const summary = await executeWorkflow(workflow, handlers, {
      signal: abortController.signal,
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.error?.code, "EXECUTION_ABORTED");
    assert.equal(summary.nodeStates["step2"], "pending");
  });

  it("retries failed node according to RetryPolicy and succeeds on subsequent attempt", async () => {
    let callCount = 0;
    const workflow: Workflow = {
      id: "wf_retry",
      name: "Retry Workflow",
      nodes: [{ id: "flake", type: "flaky_node", config: {} }],
      edges: [],
    };

    const handlers: Record<string, NodeHandler> = {
      flaky_node: {
        async execute() {
          callCount++;
          if (callCount < 3) {
            return {
              success: false,
              error: { code: "TRANSIENT_NETWORK_ERR", message: "temporary glitch" },
            };
          }
          return { success: true, output: { attempt: callCount } };
        },
      },
    };

    const summary = await executeWorkflow(workflow, handlers, {
      retryPolicy: {
        maxRetries: 3,
        retryableCodes: ["TRANSIENT_NETWORK_ERR"],
        backoffMs: 5,
      },
    });

    assert.equal(summary.status, "completed");
    assert.equal(callCount, 3);
    assert.deepEqual(summary.context.nodeOutputs["flake"], { attempt: 3 });
  });

  it("records run status as 'cancelled' in ExecutionService when aborted", async () => {
    registerCoreNodes();

    const workflowRepo = new InMemoryWorkflowRepository();
    workflowRepo.setWorkflow({
      id: "wf_cancel_svc",
      name: "Cancel Svc WF",
      description: null,
      version: 1,
      graph_definition: {
        id: "wf_cancel_svc",
        name: "Cancel Svc WF",
        nodes: [{ id: "n1", type: "passthrough", config: {} }],
        edges: [],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const runRepo = new InMemoryRunRepository();
    const runEventRepo = new InMemoryRunEventRepository();
    const execService = new ExecutionService(workflowRepo, runRepo, runEventRepo);

    const controller = new AbortController();
    controller.abort(); // already aborted before execution

    const result = await execService.startRun({
      workflowId: "wf_cancel_svc",
      signal: controller.signal,
    });

    assert.equal(result.run.status, "cancelled");
  });
});
