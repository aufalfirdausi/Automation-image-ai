import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ExecutionService,
  WorkflowNotFoundError,
  InvalidWorkflowError,
  NodeHandlerNotFoundError,
  InvalidNodeConfigError,
} from "../src/services/execution.service.js";
import { WorkflowRepository, type WorkflowRecord } from "../src/repositories/workflow.repository.js";
import { RunRepository } from "../src/repositories/run.repository.js";
import {
  RunEventRepository,
  type RunEventRecord,
  type CreateRunEventParams,
} from "../src/repositories/run-event.repository.js";
import { defaultNodeRegistry, registerCoreNodes } from "../src/nodes/index.js";
import type { Workflow } from "../src/engine/types.js";
import type { RunRecord, RunStatus, CreateRunParams } from "../src/runs/types.js";

// In-memory mock repositories for isolated service unit tests
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

  override async getRunByIdempotencyKey(
    workflowId: string,
    idempotencyKey: string
  ): Promise<RunRecord | null> {
    for (const run of this.runs.values()) {
      if (run.workflow_id === workflowId && run.idempotency_key === idempotencyKey) {
        return run;
      }
    }
    return null;
  }

  override async updateStatus(
    id: string,
    newStatus: RunStatus,
    options?: { startedAt?: string; finishedAt?: string; error?: any }
  ): Promise<RunRecord> {
    const run = this.runs.get(id);
    if (!run) throw new Error("Run not found");

    run.status = newStatus;
    if (options?.startedAt !== undefined) run.started_at = options.startedAt;
    if (options?.finishedAt !== undefined) run.finished_at = options.finishedAt;
    if (options?.error !== undefined) run.error = options.error;

    return run;
  }
}

class InMemoryRunEventRepository extends RunEventRepository {
  private events: RunEventRecord[] = [];

  override async createEvent(params: CreateRunEventParams): Promise<RunEventRecord> {
    const record: RunEventRecord = {
      id: params.id,
      run_id: params.runId,
      node_id: params.nodeId,
      node_type: params.nodeType,
      status: params.status,
      input: params.input ?? null,
      output: params.output ?? null,
      error: params.error ?? null,
      branch: params.branch ?? null,
      started_at: params.startedAt ?? null,
      finished_at: params.finishedAt ?? null,
      duration_ms: params.durationMs ?? null,
      event_order: params.eventOrder,
      created_at: new Date().toISOString(),
    };
    this.events.push(record);
    return record;
  }

  override async listEventsByRunId(runId: string): Promise<RunEventRecord[]> {
    return this.events.filter((e) => e.run_id === runId);
  }
}

describe("Phase 5.1: ExecutionService Unit & Gate Tests", () => {
  let workflowRepo: InMemoryWorkflowRepository;
  let runRepo: InMemoryRunRepository;
  let runEventRepo: InMemoryRunEventRepository;
  let service: ExecutionService;

  beforeEach(() => {
    registerCoreNodes();
    workflowRepo = new InMemoryWorkflowRepository();
    runRepo = new InMemoryRunRepository();
    runEventRepo = new InMemoryRunEventRepository();
    service = new ExecutionService(workflowRepo, runRepo, runEventRepo);
  });

  it("1. Rejects execution when workflow does not exist (Gate A)", async () => {
    await assert.rejects(
      () => service.startRun({ workflowId: "nonexistent-wf" }),
      (err: unknown) => err instanceof WorkflowNotFoundError && err.code === "WORKFLOW_NOT_FOUND"
    );
  });

  it("2. Rejects execution when workflow graph has cycles (Gate B: Invalid DAG)", async () => {
    const cyclicGraph: Workflow = {
      id: "wf-cycle",
      name: "Cyclic Workflow",
      nodes: [
        { id: "A", type: "passthrough", config: {} },
        { id: "B", type: "passthrough", config: {} },
      ],
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "A" },
      ],
    };

    workflowRepo.setWorkflow({
      id: "wf-cycle",
      name: "Cyclic Workflow",
      description: null,
      graph_definition: cyclicGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await assert.rejects(
      () => service.startRun({ workflowId: "wf-cycle" }),
      (err: unknown) =>
        err instanceof InvalidWorkflowError &&
        err.code === "INVALID_WORKFLOW" &&
        err.details.length > 0
    );
  });

  it("3. Rejects execution when workflow contains unregistered node type (Gate C)", async () => {
    const unregGraph: Workflow = {
      id: "wf-unreg",
      name: "Unregistered Node Workflow",
      nodes: [
        { id: "unknownNode", type: "non_existent_type", config: {} },
      ],
      edges: [],
    };

    workflowRepo.setWorkflow({
      id: "wf-unreg",
      name: "Unregistered",
      description: null,
      graph_definition: unregGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await assert.rejects(
      () => service.startRun({ workflowId: "wf-unreg" }),
      (err: unknown) =>
        err instanceof NodeHandlerNotFoundError &&
        err.code === "HANDLER_NOT_FOUND"
    );
  });

  it("4. Rejects execution when node configuration fails schema validation (Gate D)", async () => {
    const badConfigGraph: Workflow = {
      id: "wf-bad-config",
      name: "Bad Config",
      nodes: [
        { id: "t1", type: "text_transform", config: { operation: "unsupported_operation" } },
      ],
      edges: [],
    };

    workflowRepo.setWorkflow({
      id: "wf-bad-config",
      name: "Bad Config",
      description: null,
      graph_definition: badConfigGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await assert.rejects(
      () => service.startRun({ workflowId: "wf-bad-config" }),
      (err: unknown) =>
        err instanceof InvalidNodeConfigError &&
        err.code === "INVALID_NODE_CONFIG"
    );
  });

  it("5. Successfully executes a valid workflow through the entire lifecycle", async () => {
    const validGraph: Workflow = {
      id: "wf-valid",
      name: "Valid Pipeline",
      nodes: [
        { id: "source", type: "static_value", config: { value: "hello orchestrator" } },
        { id: "upper", type: "text_transform", config: { operation: "uppercase" } },
      ],
      edges: [{ source: "source", target: "upper" }],
    };

    workflowRepo.setWorkflow({
      id: "wf-valid",
      name: "Valid Pipeline",
      description: null,
      graph_definition: validGraph,
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await service.startRun({ workflowId: "wf-valid" });
    assert.strictEqual(result.idempotentReplay, false);
    assert.strictEqual(result.run.status, "succeeded");
    assert.strictEqual(result.run.workflowVersion, 2);
    assert.ok(result.run.startedAt);
    assert.ok(result.run.finishedAt);
    assert.strictEqual(result.run.error, null);
  });

  it("6. Captures and preserves root failure when node execution fails", async () => {
    // Register a node definition that throws or returns failure
    defaultNodeRegistry.register({
      manifest: {
        type: "failing_mock_node",
        name: "Failing Mock",
        version: "1.0.0",
        description: "Always fails",
        category: "utility",
        inputs: [],
        outputs: [],
        configFields: [],
      },
      handler: {
        async execute() {
          return {
            success: false,
            error: {
              code: "NODE_EXECUTION_FAILED",
              message: "Custom failure from failing_mock_node",
            },
          };
        },
      },
    });

    const failingGraph: Workflow = {
      id: "wf-fail",
      name: "Failing Pipeline",
      nodes: [{ id: "failNode", type: "failing_mock_node", config: {} }],
      edges: [],
    };

    workflowRepo.setWorkflow({
      id: "wf-fail",
      name: "Failing Pipeline",
      description: null,
      graph_definition: failingGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await service.startRun({ workflowId: "wf-fail" });
    assert.strictEqual(result.idempotentReplay, false);
    assert.strictEqual(result.run.status, "failed");
    assert.ok(result.run.error);
    assert.strictEqual(result.run.error.code, "NODE_EXECUTION_FAILED");
    assert.strictEqual(result.run.error.message, "Custom failure from failing_mock_node");
  });

  it("7. Guarantees idempotent replay when same idempotencyKey is used", async () => {
    const validGraph: Workflow = {
      id: "wf-idem",
      name: "Idempotent Pipeline",
      nodes: [{ id: "val", type: "static_value", config: { value: "test" } }],
      edges: [],
    };

    workflowRepo.setWorkflow({
      id: "wf-idem",
      name: "Idempotent Pipeline",
      description: null,
      graph_definition: validGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const firstRun = await service.startRun({
      workflowId: "wf-idem",
      idempotencyKey: "unique-key-123",
    });
    assert.strictEqual(firstRun.idempotentReplay, false);

    const secondRun = await service.startRun({
      workflowId: "wf-idem",
      idempotencyKey: "unique-key-123",
    });
    assert.strictEqual(secondRun.idempotentReplay, true);
    assert.strictEqual(secondRun.run.id, firstRun.run.id);
  });

  it("8. Successfully executes visual editor workflow (manual_trigger -> condition -> action)", async () => {
    const visualGraph: Workflow = {
      id: "wf-visual-demo",
      name: "Visual Demo Pipeline",
      nodes: [
        { id: "node_1", type: "manual_trigger", config: {} },
        { id: "node_2", type: "condition", config: { operator: "truthy" } },
        { id: "node_3", type: "action", config: { title: "Success Action" } },
        { id: "node_4", type: "action", config: { title: "Failure Action" } },
      ],
      edges: [
        { source: "node_1", target: "node_2" },
        { source: "node_2", target: "node_3", sourceHandle: "true" },
        { source: "node_2", target: "node_4", sourceHandle: "false" },
      ],
    };

    workflowRepo.setWorkflow({
      id: "wf-visual-demo",
      name: "Visual Demo Pipeline",
      description: null,
      graph_definition: visualGraph,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const runResult = await service.startRun({
      workflowId: "wf-visual-demo",
      triggerPayload: "valid_input_data",
    });

    assert.strictEqual(runResult.idempotentReplay, false);
    assert.strictEqual(runResult.run.status, "succeeded");
    assert.strictEqual(runResult.run.error, null);

    // Verify events recorded
    const events = await runEventRepo.listEventsByRunId(runResult.run.id);
    assert.ok(events.length > 0);

    const triggerEvent = events.find((e) => e.node_id === "node_1" && e.status === "completed");
    const condEvent = events.find((e) => e.node_id === "node_2" && e.status === "completed");
    const trueAction = events.find((e) => e.node_id === "node_3" && e.status === "completed");
    const falseAction = events.find((e) => e.node_id === "node_4" && e.status === "skipped");

    assert.strictEqual(triggerEvent?.status, "completed");
    assert.strictEqual(condEvent?.status, "completed");
    assert.strictEqual(condEvent?.branch, "true");
    assert.strictEqual(trueAction?.status, "completed");
    assert.strictEqual(falseAction?.status, "skipped");
  });
});
