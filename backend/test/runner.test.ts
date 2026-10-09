import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow } from "../src/engine/runner.js";
import type { Workflow } from "../src/engine/types.js";
import type { NodeHandler } from "../src/engine/execution-types.js";

describe("executeWorkflow (Graph Executor)", () => {
  it("should execute a linear graph A -> B -> C in order", async () => {
    const executionOrder: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      stepA: {
        async execute(params) {
          executionOrder.push(params.nodeId);
          return { success: true, output: { step: "A", count: 1 } };
        },
      },
      stepB: {
        async execute(params) {
          executionOrder.push(params.nodeId);
          const prev = params.input as { count: number };
          return { success: true, output: { step: "B", count: prev.count + 1 } };
        },
      },
      stepC: {
        async execute(params) {
          executionOrder.push(params.nodeId);
          const prev = params.input as { count: number };
          return { success: true, output: { step: "C", count: prev.count + 1 } };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-linear",
      name: "Linear Pipeline",
      nodes: [
        { id: "node-A", type: "stepA", config: {} },
        { id: "node-B", type: "stepB", config: {} },
        { id: "node-C", type: "stepC", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-B" },
        { source: "node-B", target: "node-C" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    assert.deepEqual(executionOrder, ["node-A", "node-B", "node-C"]);
    assert.equal(summary.nodeStates["node-A"], "completed");
    assert.equal(summary.nodeStates["node-B"], "completed");
    assert.equal(summary.nodeStates["node-C"], "completed");
    assert.equal(summary.edgeStates["node-A->node-B"], "active");
    assert.equal(summary.edgeStates["node-B->node-C"], "active");
    assert.deepEqual(summary.context.nodeOutputs["node-C"], { step: "C", count: 3 });
  });

  it("should execute a branching graph A -> B and A -> C in lexicographical queue order", async () => {
    const executionOrder: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      source: {
        async execute(params) {
          executionOrder.push(params.nodeId);
          return { success: true, output: { base: 10 } };
        },
      },
      branch: {
        async execute(params) {
          executionOrder.push(params.nodeId);
          const prev = params.input as { base: number };
          return { success: true, output: { result: prev.base * 2 } };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-branch",
      name: "Branching Pipeline",
      nodes: [
        { id: "node-A", type: "source", config: {} },
        { id: "node-B", type: "branch", config: {} },
        { id: "node-C", type: "branch", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-B" },
        { source: "node-A", target: "node-C" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    // Lexicographical ordering ensures B runs before C
    assert.deepEqual(executionOrder, ["node-A", "node-B", "node-C"]);
    assert.equal(summary.nodeStates["node-A"], "completed");
    assert.equal(summary.nodeStates["node-B"], "completed");
    assert.equal(summary.nodeStates["node-C"], "completed");
    assert.equal(summary.edgeStates["node-A->node-B"], "active");
    assert.equal(summary.edgeStates["node-A->node-C"], "active");
  });

  it("should execute a fan-in diamond A -> B/C -> D with combined active inputs", async () => {
    let fanInInputReceived: unknown = null;

    const handlers: Record<string, NodeHandler> = {
      root: {
        async execute() {
          return { success: true, output: "root-data" };
        },
      },
      branchB: {
        async execute() {
          return { success: true, output: { branch: "B", value: 100 } };
        },
      },
      branchC: {
        async execute() {
          return { success: true, output: { branch: "C", value: 200 } };
        },
      },
      mergeD: {
        async execute(params) {
          fanInInputReceived = params.input;
          return { success: true, output: "merged" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-diamond",
      name: "Diamond Fan-In",
      nodes: [
        { id: "node-A", type: "root", config: {} },
        { id: "node-B", type: "branchB", config: {} },
        { id: "node-C", type: "branchC", config: {} },
        { id: "node-D", type: "mergeD", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-B" },
        { source: "node-A", target: "node-C" },
        { source: "node-B", target: "node-D" },
        { source: "node-C", target: "node-D" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    assert.equal(summary.nodeStates["node-D"], "completed");
    // Node D receives multiple active inputs keyed by predecessor node ID
    assert.deepEqual(fanInInputReceived, {
      "node-B": { branch: "B", value: 100 },
      "node-C": { branch: "C", value: 200 },
    });
  });

  it("should handle conditional branching IF -> B/C -> D, skipping inactive branch and executing active branch", async () => {
    const executedNodes: string[] = [];
    let dReceivedInput: unknown = null;

    const handlers: Record<string, NodeHandler> = {
      condition: {
        async execute() {
          executedNodes.push("IF");
          // Choose "true" branch
          return {
            success: true,
            output: { authenticated: true },
            branch: "true",
          };
        },
      },
      actionB: {
        async execute(params) {
          executedNodes.push("B");
          return { success: true, output: { message: "Authenticated successfully" } };
        },
      },
      actionC: {
        async execute() {
          executedNodes.push("C");
          return { success: true, output: { message: "Authentication failed" } };
        },
      },
      actionD: {
        async execute(params) {
          executedNodes.push("D");
          dReceivedInput = params.input;
          return { success: true, output: "done" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-if-merge",
      name: "Conditional Branch Merge",
      nodes: [
        { id: "node-IF", type: "condition", config: {} },
        { id: "node-B", type: "actionB", config: {} },
        { id: "node-C", type: "actionC", config: {} },
        { id: "node-D", type: "actionD", config: {} },
      ],
      edges: [
        { source: "node-IF", target: "node-B", sourceHandle: "true" },
        { source: "node-IF", target: "node-C", sourceHandle: "false" },
        { source: "node-B", target: "node-D" },
        { source: "node-C", target: "node-D" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    // Node C was skipped and never executed!
    assert.deepEqual(executedNodes, ["IF", "B", "D"]);
    assert.equal(summary.nodeStates["node-IF"], "completed");
    assert.equal(summary.nodeStates["node-B"], "completed");
    assert.equal(summary.nodeStates["node-C"], "skipped");
    assert.equal(summary.nodeStates["node-D"], "completed");

    // Edge states
    assert.equal(summary.edgeStates["node-IF#true->node-B"], "active");
    assert.equal(summary.edgeStates["node-IF#false->node-C"], "skipped");
    assert.equal(summary.edgeStates["node-B->node-D"], "active");
    assert.equal(summary.edgeStates["node-C->node-D"], "skipped");

    // Node D received input only from the active predecessor (node-B)
    assert.deepEqual(dReceivedInput, { message: "Authenticated successfully" });
  });

  it("should perform cascading skip across multi-level subgraphs", async () => {
    const executedNodes: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      condition: {
        async execute() {
          executedNodes.push("IF");
          return { success: true, output: {}, branch: "active-path" };
        },
      },
      noop: {
        async execute(params) {
          executedNodes.push(params.nodeId);
          return { success: true, output: {} };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-cascade",
      name: "Cascading Skip",
      nodes: [
        { id: "node-IF", type: "condition", config: {} },
        { id: "node-A", type: "noop", config: {} },
        { id: "node-S1", type: "noop", config: {} },
        { id: "node-S2", type: "noop", config: {} },
        { id: "node-S3", type: "noop", config: {} },
      ],
      edges: [
        { source: "node-IF", target: "node-A", sourceHandle: "active-path" },
        { source: "node-IF", target: "node-S1", sourceHandle: "inactive-path" },
        { source: "node-S1", target: "node-S2" },
        { source: "node-S2", target: "node-S3" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    assert.deepEqual(executedNodes, ["IF", "node-A"]);
    assert.equal(summary.nodeStates["node-S1"], "skipped");
    assert.equal(summary.nodeStates["node-S2"], "skipped");
    assert.equal(summary.nodeStates["node-S3"], "skipped");
    assert.equal(summary.edgeStates["node-S1->node-S2"], "skipped");
    assert.equal(summary.edgeStates["node-S2->node-S3"], "skipped");
  });

  it("should trigger fail-fast when a node returns explicit failure and abort downstream execution", async () => {
    const executedNodes: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      step1: {
        async execute() {
          executedNodes.push("node-1");
          return { success: true, output: "ok" };
        },
      },
      failingStep: {
        async execute() {
          executedNodes.push("node-2");
          return {
            success: false,
            error: { message: "Payment service unavailable", code: "PAYMENT_FAILED" },
          };
        },
      },
      step3: {
        async execute() {
          executedNodes.push("node-3");
          return { success: true, output: "done" };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-fail-fast",
      name: "Fail Fast Workflow",
      nodes: [
        { id: "node-1", type: "step1", config: {} },
        { id: "node-2", type: "failingStep", config: {} },
        { id: "node-3", type: "step3", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "failed");
    assert.deepEqual(executedNodes, ["node-1", "node-2"]);
    assert.equal(summary.nodeStates["node-1"], "completed");
    assert.equal(summary.nodeStates["node-2"], "failed");
    // Downstream node-3 must remain pending (never executed)
    assert.equal(summary.nodeStates["node-3"], "pending");
    assert.equal(summary.edgeStates["node-2->node-3"], "blocked");
    assert.equal(summary.error?.code, "PAYMENT_FAILED");
  });

  it("should trigger fail-fast when an unexpected exception is thrown inside a node handler", async () => {
    const handlers: Record<string, NodeHandler> = {
      crasher: {
        async execute() {
          throw new Error("Disk full panic");
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-crash",
      name: "Crash Workflow",
      nodes: [{ id: "node-crash", type: "crasher", config: {} }],
      edges: [],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "failed");
    assert.equal(summary.nodeStates["node-crash"], "failed");
    assert.equal(summary.error?.code, "NODE_EXECUTION_EXCEPTION");
    assert.ok(summary.error?.message.includes("Disk full panic"));
  });

  it("should execute multiple root nodes independently", async () => {
    const executedRoots: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      worker: {
        async execute(params) {
          executedRoots.push(params.nodeId);
          return { success: true, output: { id: params.nodeId } };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-multi-roots",
      name: "Multiple Roots",
      nodes: [
        { id: "root-B", type: "worker", config: {} },
        { id: "root-A", type: "worker", config: {} },
        { id: "child-A", type: "worker", config: {} },
      ],
      edges: [{ source: "root-A", target: "child-A" }],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    // Ready queue is sorted lexicographically: root-A runs, queues child-A;
    // then child-A ('c') runs before root-B ('r').
    assert.deepEqual(executedRoots, ["root-A", "child-A", "root-B"]);
    assert.equal(summary.nodeStates["root-A"], "completed");
    assert.equal(summary.nodeStates["root-B"], "completed");
    assert.equal(summary.nodeStates["child-A"], "completed");
  });

  it("should execute disconnected nodes independently", async () => {
    const executed: string[] = [];

    const handlers: Record<string, NodeHandler> = {
      worker: {
        async execute(params) {
          executed.push(params.nodeId);
          return { success: true, output: {} };
        },
      },
    };

    const workflow: Workflow = {
      id: "wf-disconnected",
      name: "Disconnected Nodes",
      nodes: [
        { id: "node-1", type: "worker", config: {} },
        { id: "node-2", type: "worker", config: {} },
        { id: "node-island", type: "worker", config: {} },
      ],
      edges: [{ source: "node-1", target: "node-2" }],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    assert.equal(executed.includes("node-island"), true);
    assert.equal(summary.nodeStates["node-island"], "completed");
    assert.equal(summary.nodeStates["node-1"], "completed");
    assert.equal(summary.nodeStates["node-2"], "completed");
  });

  it("should immediately complete empty workflows without error", async () => {
    const workflow: Workflow = {
      id: "wf-empty",
      name: "Empty Workflow",
      nodes: [],
      edges: [],
    };

    const summary = await executeWorkflow(workflow, {});

    assert.equal(summary.status, "completed");
    assert.deepEqual(summary.nodeStates, {});
    assert.deepEqual(summary.edgeStates, {});
  });

  it("should guarantee that no node executes more than once", async () => {
    const callCounts = new Map<string, number>();

    const handlers: Record<string, NodeHandler> = {
      tracker: {
        async execute(params) {
          const count = (callCounts.get(params.nodeId) || 0) + 1;
          callCounts.set(params.nodeId, count);
          return { success: true, output: { count } };
        },
      },
    };

    // Diamond pattern where node-D has two active incoming paths
    const workflow: Workflow = {
      id: "wf-single-run",
      name: "Single Run Assurance",
      nodes: [
        { id: "node-A", type: "tracker", config: {} },
        { id: "node-B", type: "tracker", config: {} },
        { id: "node-C", type: "tracker", config: {} },
        { id: "node-D", type: "tracker", config: {} },
      ],
      edges: [
        { source: "node-A", target: "node-B" },
        { source: "node-A", target: "node-C" },
        { source: "node-B", target: "node-D" },
        { source: "node-C", target: "node-D" },
      ],
    };

    const summary = await executeWorkflow(workflow, handlers);

    assert.equal(summary.status, "completed");
    assert.equal(callCounts.get("node-A"), 1);
    assert.equal(callCounts.get("node-B"), 1);
    assert.equal(callCounts.get("node-C"), 1);
    assert.equal(callCounts.get("node-D"), 1);
  });

  it("should reject invalid/cyclic workflows before execution", async () => {
    let anyExecuted = false;

    const handlers: Record<string, NodeHandler> = {
      noop: {
        async execute() {
          anyExecuted = true;
          return { success: true, output: {} };
        },
      },
    };

    const cyclicWorkflow: Workflow = {
      id: "wf-cyclic",
      name: "Cyclic Workflow",
      nodes: [
        { id: "node-1", type: "noop", config: {} },
        { id: "node-2", type: "noop", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-1" },
      ],
    };

    const summary = await executeWorkflow(cyclicWorkflow, handlers);

    assert.equal(summary.status, "failed");
    assert.equal(summary.error?.code, "INVALID_WORKFLOW");
    assert.equal(anyExecuted, false, "No nodes should execute in a cyclic workflow");
  });
});
