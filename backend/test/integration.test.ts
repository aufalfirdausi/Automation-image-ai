import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type NodeHandler,
  type WorkflowExecutionSummary,
  executeWorkflow,
  getEdgeKey,
} from "../src/engine/index.js";

describe("Phase 2: Comprehensive Engine Integration Test Suite", () => {
  // 1. Linear Graph: A -> B -> C
  it("1. Linear Graph: executes A -> B -> C sequentially with direct output passing", async () => {
    const executionTrace: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      nodeA: {
        async execute() {
          executionTrace.push("A");
          return { success: true, output: "payload-A" };
        },
      },
      nodeB: {
        async execute(params) {
          executionTrace.push("B");
          assert.strictEqual(params.input, "payload-A");
          return { success: true, output: { fromB: params.input } };
        },
      },
      nodeC: {
        async execute(params) {
          executionTrace.push("C");
          assert.deepStrictEqual(params.input, { fromB: "payload-A" });
          return { success: true, output: "done-C" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-linear",
      name: "Linear Pipeline",
      nodes: [
        { id: "node-A", type: "nodeA", config: {} },
        { id: "node-B", type: "nodeB", config: {} },
        { id: "node-C", type: "nodeC", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-B" },
        { source: "node-B", target: "node-C" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    assert.deepStrictEqual(executionTrace, ["A", "B", "C"]);
    assert.strictEqual(summary.nodeStates["node-A"], "completed");
    assert.strictEqual(summary.nodeStates["node-B"], "completed");
    assert.strictEqual(summary.nodeStates["node-C"], "completed");
    assert.strictEqual(summary.context.nodeOutputs["node-A"], "payload-A");
    assert.deepStrictEqual(summary.context.nodeOutputs["node-B"], { fromB: "payload-A" });
    assert.strictEqual(summary.context.nodeOutputs["node-C"], "done-C");
  });

  // 2. Fan-out: A -> B, A -> C
  it("2. Fan-out: A executes, then broadcasts output to B and C deterministically", async () => {
    const executionTrace: string[] = [];
    const receivedInputs: Record<string, unknown> = {};

    const handlers: Record<string, NodeHandler> = {
      nodeA: {
        async execute() {
          executionTrace.push("A");
          return { success: true, output: { broadcast: "shared-data" } };
        },
      },
      nodeB: {
        async execute(params) {
          executionTrace.push("B");
          receivedInputs["B"] = params.input;
          return { success: true, output: "done-B" };
        },
      },
      nodeC: {
        async execute(params) {
          executionTrace.push("C");
          receivedInputs["C"] = params.input;
          return { success: true, output: "done-C" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-fanout",
      name: "Fan-out Pipeline",
      nodes: [
        { id: "A", type: "nodeA", config: {} },
        { id: "B", type: "nodeB", config: {} },
        { id: "C", type: "nodeC", config: {} },
      ],
      edges: [
        { source: "A", target: "B" },
        { source: "A", target: "C" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    assert.deepStrictEqual(executionTrace, ["A", "B", "C"]);
    assert.deepStrictEqual(receivedInputs["B"], { broadcast: "shared-data" });
    assert.deepStrictEqual(receivedInputs["C"], { broadcast: "shared-data" });
  });

  // 3. Fan-in: A -> C, B -> C (Multiple active inputs)
  it("3. Fan-in: multiple active predecessors provide aggregated object { [sourceId]: output } to C", async () => {
    let fanInInput: unknown = null;

    const handlers: Record<string, NodeHandler> = {
      nodeA: {
        async execute() {
          return { success: true, output: 100 };
        },
      },
      nodeB: {
        async execute() {
          return { success: true, output: 200 };
        },
      },
      nodeC: {
        async execute(params) {
          fanInInput = params.input;
          return { success: true, output: "combined" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-fanin",
      name: "Fan-in Pipeline",
      nodes: [
        { id: "node-A", type: "nodeA", config: {} },
        { id: "node-B", type: "nodeB", config: {} },
        { id: "node-C", type: "nodeC", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-C" },
        { source: "node-B", target: "node-C" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    assert.strictEqual(summary.nodeStates["node-A"], "completed");
    assert.strictEqual(summary.nodeStates["node-B"], "completed");
    assert.strictEqual(summary.nodeStates["node-C"], "completed");
    assert.deepStrictEqual(fanInInput, {
      "node-A": 100,
      "node-B": 200,
    });
  });

  // 4. Conditional: A -> IF, IF -> B (true), IF -> C (false)
  it("4. Conditional: A -> IF routes execution to active branch and prunes inactive branch", async () => {
    const executed: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      starter: {
        async execute() {
          executed.push("A");
          return { success: true, output: { score: 95 } };
        },
      },
      condition: {
        async execute(params) {
          executed.push("IF");
          const input = params.input as { score: number };
          const branch = input.score >= 80 ? "pass" : "fail";
          return { success: true, output: { verified: true }, branch };
        },
      },
      passedHandler: {
        async execute() {
          executed.push("B");
          return { success: true, output: "honors" };
        },
      },
      failedHandler: {
        async execute() {
          executed.push("C");
          return { success: true, output: "remedial" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-conditional",
      name: "Conditional Pipeline",
      nodes: [
        { id: "A", type: "starter", config: {} },
        { id: "IF", type: "condition", config: {} },
        { id: "B", type: "passedHandler", config: {} },
        { id: "C", type: "failedHandler", config: {} },
      ],
      edges: [
        { source: "A", target: "IF" },
        { source: "IF", target: "B", sourceHandle: "pass" },
        { source: "IF", target: "C", sourceHandle: "fail" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    assert.deepStrictEqual(executed, ["A", "IF", "B"]);
    assert.strictEqual(summary.nodeStates["A"], "completed");
    assert.strictEqual(summary.nodeStates["IF"], "completed");
    assert.strictEqual(summary.nodeStates["B"], "completed");
    assert.strictEqual(summary.nodeStates["C"], "skipped");
  });

  // 5. Skipped branch merge: IF -> B, IF -> C, B -> D, C -> D (Mixed active/skipped inputs)
  it("5. Skipped branch merge: D resolves when all incoming edges are resolved, receives only active input", async () => {
    let dReceivedInput: unknown = undefined;

    const handlers: Record<string, NodeHandler> = {
      condition: {
        async execute() {
          return { success: true, output: "start", branch: "b-branch" };
        },
      },
      branchB: {
        async execute(params) {
          return { success: true, output: { fromB: "success-data", prev: params.input } };
        },
      },
      branchC: {
        async execute() {
          return { success: true, output: "should-not-run" };
        },
      },
      mergeD: {
        async execute(params) {
          dReceivedInput = params.input;
          return { success: true, output: "final-d" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-merge-skipped",
      name: "Merge Skipped Pipeline",
      nodes: [
        { id: "IF", type: "condition", config: {} },
        { id: "B", type: "branchB", config: {} },
        { id: "C", type: "branchC", config: {} },
        { id: "D", type: "mergeD", config: {} },
      ],
      edges: [
        { source: "IF", target: "B", sourceHandle: "b-branch" },
        { source: "IF", target: "C", sourceHandle: "c-branch" },
        { source: "B", target: "D" },
        { source: "C", target: "D" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    assert.strictEqual(summary.nodeStates["B"], "completed");
    assert.strictEqual(summary.nodeStates["C"], "skipped");
    assert.strictEqual(summary.nodeStates["D"], "completed");
    // Mixed active (B) and skipped (C): exactly 1 active predecessor, so D receives direct value from B
    assert.deepStrictEqual(dReceivedInput, { fromB: "success-data", prev: "start" });
  });

  // 6. Failure propagation: A -> B(fail) -> C
  it("6. Failure propagation: B fails, outgoing edge to C becomes blocked, C never executes, fail-fast halts", async () => {
    const executed: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      stepA: {
        async execute() {
          executed.push("A");
          return { success: true, output: "A-done" };
        },
      },
      stepB: {
        async execute() {
          executed.push("B");
          return {
            success: false,
            error: { message: "B failed due to resource constraint", code: "RESOURCE_LIMIT" },
          };
        },
      },
      stepC: {
        async execute() {
          executed.push("C");
          return { success: true, output: "C-done" };
        },
      },
    };

    const edgeBC: WorkflowEdge = { source: "B", target: "C" };
    const workflow: Workflow = {
      id: "wf-fail-prop",
      name: "Fail Propagation",
      nodes: [
        { id: "A", type: "stepA", config: {} },
        { id: "B", type: "stepB", config: {} },
        { id: "C", type: "stepC", config: {} },
      ],
      edges: [{ source: "A", target: "B" }, edgeBC],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "failed");
    assert.deepStrictEqual(executed, ["A", "B"]);
    assert.strictEqual(summary.nodeStates["A"], "completed");
    assert.strictEqual(summary.nodeStates["B"], "failed");
    assert.strictEqual(summary.nodeStates["C"], "pending");
    assert.strictEqual(summary.edgeStates[getEdgeKey(edgeBC)], "blocked");

    // Output node sebelumnya tetap tersedia
    assert.strictEqual(summary.context.nodeOutputs["A"], "A-done");
    // Failed node tidak masuk nodeOutputs
    assert.strictEqual("B" in summary.context.nodeOutputs, false);
    assert.strictEqual(summary.context.nodeOutputs["B"], undefined);

    // Summary final benar
    assert.strictEqual(summary.error?.code, "RESOURCE_LIMIT");
    assert.strictEqual(summary.error?.message, "B failed due to resource constraint");
  });

  // 7. Multiple roots: A -> C, B -> D
  it("7. Multiple roots: executes disconnected trees independently with lexicographical root ordering", async () => {
    const executed: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      t: {
        async execute(params) {
          executed.push(params.nodeId);
          return { success: true, output: `${params.nodeId}-ok` };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-multi-roots",
      name: "Multiple Roots",
      nodes: [
        { id: "node-B", type: "t", config: {} },
        { id: "node-A", type: "t", config: {} },
        { id: "node-C", type: "t", config: {} },
        { id: "node-D", type: "t", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-C" },
        { source: "node-B", target: "node-D" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.strictEqual(summary.status, "completed");
    // Initial roots: ["node-A", "node-B"] (sorted).
    // node-A runs -> queues node-C -> queue: ["node-B", "node-C"]
    // node-B runs -> queues node-D -> queue: ["node-C", "node-D"]
    // node-C runs
    // node-D runs
    assert.deepStrictEqual(executed, ["node-A", "node-B", "node-C", "node-D"]);
    assert.strictEqual(summary.nodeStates["node-A"], "completed");
    assert.strictEqual(summary.nodeStates["node-B"], "completed");
    assert.strictEqual(summary.nodeStates["node-C"], "completed");
    assert.strictEqual(summary.nodeStates["node-D"], "completed");
  });

  // 8. Invalid workflow
  it("8. Invalid workflow: rejects cyclic graph before execution and returns INVALID_WORKFLOW", async () => {
    const workflow: Workflow = {
      id: "wf-invalid",
      name: "Invalid Cycle",
      nodes: [
        { id: "X", type: "t", config: {} },
        { id: "Y", type: "t", config: {} },
      ],
      edges: [
        { source: "X", target: "Y" },
        { source: "Y", target: "X" },
      ],
    };

    const summary = await executeWorkflow(workflow, {});

    assert.strictEqual(summary.status, "failed");
    assert.strictEqual(summary.error?.code, "INVALID_WORKFLOW");
    assert.deepStrictEqual(summary.nodeStates, {});
    assert.deepStrictEqual(summary.edgeStates, {});
  });

  // 9. Deterministic execution order verification
  it("9. Deterministic execution order: ensures identical queue traversal order across multiple runs", async () => {
    const runOrder = async (): Promise<string[]> => {
      const order: string[] = [];
      const handlers: Record<string, NodeHandler> = {
        worker: {
          async execute(p) {
            order.push(p.nodeId);
            return { success: true };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-order",
        name: "Order Test",
        nodes: [
          { id: "Z-root", type: "worker", config: {} },
          { id: "A-root", type: "worker", config: {} },
          { id: "M-root", type: "worker", config: {} },
        ],
        edges: [],
      };

      await executeWorkflow(workflow, handlers);
      return order;
    };

    const order1 = await runOrder();
    const order2 = await runOrder();
    const order3 = await runOrder();

    assert.deepStrictEqual(order1, ["A-root", "M-root", "Z-root"]);
    assert.deepStrictEqual(order2, order1);
    assert.deepStrictEqual(order3, order1);
  });

  // 10. Complex combination: Branching + Fan-in + Failure in one workflow
  it("10. Complex Pipeline: Branching + Fan-in + Failure validates full engine coordination", async () => {
    /**
     * Graph topology:
     *
     *          ┌─(pass)─> SuccessBranch ─┐
     * IF-Auth ─┤                         ├─> AuditCollector
     *          └─(fail)─> FailBranch    ─┘
     *                         │
     *                         └───────────> BombNode (throws) ──> FinalReport
     */
    const executed: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      auth: {
        async execute() {
          executed.push("IF-Auth");
          return {
            success: true,
            output: { user: "alice" },
            branch: "fail", // choose fail branch
          };
        },
      },
      successHandler: {
        async execute() {
          executed.push("SuccessBranch");
          return { success: true, output: "all-good" };
        },
      },
      failHandler: {
        async execute(params) {
          executed.push("FailBranch");
          return {
            success: true,
            output: { reason: "forbidden", user: params.input },
          };
        },
      },
      audit: {
        async execute(params) {
          executed.push("AuditCollector");
          return { success: true, output: params.input };
        },
      },
      bomb: {
        async execute() {
          executed.push("BombNode");
          throw new Error("Downstream system crashed unexpectedly");
        },
      },
      final: {
        async execute() {
          executed.push("FinalReport");
          return { success: true, output: "done" };
        },
      },
    };

    const edgeBombToFinal: WorkflowEdge = { source: "BombNode", target: "FinalReport" };
    const workflow: Workflow = {
      id: "wf-complex",
      name: "Complex Branching Fan-in Failure",
      nodes: [
        { id: "IF-Auth", type: "auth", config: {} },
        { id: "SuccessBranch", type: "successHandler", config: {} },
        { id: "FailBranch", type: "failHandler", config: {} },
        { id: "AuditCollector", type: "audit", config: {} },
        { id: "BombNode", type: "bomb", config: {} },
        { id: "FinalReport", type: "final", config: {} },
      ],
      edges: [
        { source: "IF-Auth", target: "SuccessBranch", sourceHandle: "pass" },
        { source: "IF-Auth", target: "FailBranch", sourceHandle: "fail" },
        { source: "SuccessBranch", target: "AuditCollector" },
        { source: "FailBranch", target: "AuditCollector" },
        { source: "FailBranch", target: "BombNode" },
        edgeBombToFinal,
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    // 1. Overall status
    assert.strictEqual(summary.status, "failed");

    // 2. Execution path: IF-Auth ran, chose fail branch.
    // SuccessBranch skipped, cascading skip to edge SuccessBranch -> AuditCollector.
    // FailBranch ran, succeeded, outputting to AuditCollector and BombNode.
    // AuditCollector was ready (1 active edge from FailBranch, 1 skipped edge from SuccessBranch) and ran.
    // BombNode ran and threw an exception.
    // FinalReport was pending and never executed.
    assert.deepStrictEqual(executed, ["IF-Auth", "FailBranch", "AuditCollector", "BombNode"]);

    // 3. Node States
    assert.strictEqual(summary.nodeStates["IF-Auth"], "completed");
    assert.strictEqual(summary.nodeStates["SuccessBranch"], "skipped");
    assert.strictEqual(summary.nodeStates["FailBranch"], "completed");
    assert.strictEqual(summary.nodeStates["AuditCollector"], "completed");
    assert.strictEqual(summary.nodeStates["BombNode"], "failed");
    assert.strictEqual(summary.nodeStates["FinalReport"], "pending");

    // 4. Edge States
    assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[0])], "skipped");
    assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[1])], "active");
    assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[2])], "skipped");
    assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[3])], "active");
    assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[4])], "active");
    assert.strictEqual(summary.edgeStates[getEdgeKey(edgeBombToFinal)], "blocked");

    // 5. Context outputs: only completed nodes have outputs
    assert.deepStrictEqual(summary.context.nodeOutputs["IF-Auth"], { user: "alice" });
    assert.deepStrictEqual(summary.context.nodeOutputs["FailBranch"], {
      reason: "forbidden",
      user: { user: "alice" },
    });
    assert.deepStrictEqual(summary.context.nodeOutputs["AuditCollector"], {
      reason: "forbidden",
      user: { user: "alice" },
    });
    // Failed and unexecuted nodes are completely omitted
    assert.strictEqual("BombNode" in summary.context.nodeOutputs, false);
    assert.strictEqual("FinalReport" in summary.context.nodeOutputs, false);
    assert.strictEqual("SuccessBranch" in summary.context.nodeOutputs, false);

    // 6. Error structure and code
    assert.strictEqual(summary.error?.code, "NODE_EXECUTION_EXCEPTION");
    assert.strictEqual(summary.error?.message, "Downstream system crashed unexpectedly");

    // 7. Context and summary immutability
    assert.ok(Object.isFrozen(summary));
    assert.ok(Object.isFrozen(summary.context));
    assert.ok(Object.isFrozen(summary.context.nodeOutputs));
    assert.ok(Object.isFrozen(summary.nodeStates));
    assert.ok(Object.isFrozen(summary.edgeStates));
  });
});
