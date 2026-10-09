import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionService } from "../src/services/execution.service.js";
import { WorkflowRepository, type WorkflowRecord } from "../src/repositories/workflow.repository.js";
import { RunRepository } from "../src/repositories/run.repository.js";
import { RunEventRepository, type CreateRunEventParams, type RunEventRecord } from "../src/repositories/run-event.repository.js";
import { defaultNodeRegistry, registerCoreNodes } from "../src/nodes/index.js";
import type { Workflow } from "../src/engine/types.js";
import type { RunRecord, RunStatus, CreateRunParams } from "../src/runs/types.js";

// Mock repositories
class MockWorkflowRepo extends WorkflowRepository {
  private workflow: WorkflowRecord;
  constructor(wf: WorkflowRecord) {
    super();
    this.workflow = wf;
  }
  override async getWorkflowById(): Promise<WorkflowRecord | null> {
    return this.workflow;
  }
}

class MockRunRepo extends RunRepository {
  public run: RunRecord | null = null;
  override async createRun(params: CreateRunParams): Promise<RunRecord> {
    this.run = {
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
    return this.run;
  }
  override async getRunById(): Promise<RunRecord | null> {
    return this.run;
  }
  override async getRunByIdempotencyKey(): Promise<RunRecord | null> {
    return null;
  }
  override async updateStatus(id: string, newStatus: RunStatus, options?: any): Promise<RunRecord> {
    if (!this.run) throw new Error("Run not found");
    this.run.status = newStatus;
    if (options?.startedAt) this.run.started_at = options.startedAt;
    if (options?.finishedAt) this.run.finished_at = options.finishedAt;
    if (options?.error) this.run.error = options.error;
    return this.run;
  }
}

// Faulty event repository simulating database connection dropped during event emission
class FaultyEventRepo extends RunEventRepository {
  override async createEvent(_params: CreateRunEventParams): Promise<RunEventRecord> {
    throw new Error("Simulated database failure during event persistence");
  }
}

describe("Phase 5.2: Event Persistence Failure-Injection Test", () => {
  it("execution completes successfully even if event persistence throws an exception", async () => {
    registerCoreNodes();

    const sampleWorkflow: Workflow = {
      id: "wf-failure-injection",
      name: "Fault Tolerant Workflow",
      nodes: [
        { id: "node1", type: "static_value", config: { value: "resilient data" } },
      ],
      edges: [],
    };

    const wfRecord: WorkflowRecord = {
      id: "wf-failure-injection",
      name: "Fault Tolerant Workflow",
      description: null,
      graph_definition: sampleWorkflow,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const wfRepo = new MockWorkflowRepo(wfRecord);
    const runRepo = new MockRunRepo();
    const faultyEventRepo = new FaultyEventRepo();

    const service = new ExecutionService(wfRepo, runRepo, faultyEventRepo);

    // Suppress console.error during expected failure injection
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const result = await service.startRun({ workflowId: "wf-failure-injection" });

      assert.strictEqual(result.run.status, "succeeded");
      assert.strictEqual(result.run.workflowId, "wf-failure-injection");
      assert.ok(result.run.finishedAt);
      assert.strictEqual(result.run.error, null);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
