import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Workflow, WorkflowEdge } from "../src/engine/types.js";
import type { NodeHandler } from "../src/engine/execution-types.js";
import { getEdgeKey } from "../src/engine/runner-types.js";
import { resolveOutgoingEdgeStates } from "../src/engine/resolve-edges.js";
import { executeWorkflow } from "../src/engine/runner.js";

describe("Phase 2.6: Branching", () => {
  describe("resolveOutgoingEdgeStates (Pure helper)", () => {
    it("returns an empty frozen record when outgoingEdges is empty", () => {
      const result = resolveOutgoingEdgeStates([], "true");
      assert.deepStrictEqual(result, {});
      assert.ok(Object.isFrozen(result));
    });

    it("activates default edges and skips named handles when branch is undefined", () => {
      const edges: WorkflowEdge[] = [
        { source: "A", target: "B" }, // sourceHandle undefined -> default
        { source: "A", target: "C", sourceHandle: "" }, // empty string -> default
        { source: "A", target: "D", sourceHandle: "default" }, // "default" -> default
        { source: "A", target: "E", sourceHandle: "true" }, // named handle -> skipped
        { source: "A", target: "F", sourceHandle: "false" }, // named handle -> skipped
      ];

      const result = resolveOutgoingEdgeStates(edges, undefined);

      assert.strictEqual(result[getEdgeKey(edges[0])], "active");
      assert.strictEqual(result[getEdgeKey(edges[1])], "active");
      assert.strictEqual(result[getEdgeKey(edges[2])], "active");
      assert.strictEqual(result[getEdgeKey(edges[3])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[4])], "skipped");
      assert.ok(Object.isFrozen(result));
    });

    it("activates matching handle and skips non-matching / default edges when branch is 'true'", () => {
      const edges: WorkflowEdge[] = [
        { source: "IF", target: "A", sourceHandle: "true" },
        { source: "IF", target: "B", sourceHandle: "false" },
        { source: "IF", target: "C" }, // default
        { source: "IF", target: "D", sourceHandle: "default" }, // default
      ];

      const result = resolveOutgoingEdgeStates(edges, "true");

      assert.strictEqual(result[getEdgeKey(edges[0])], "active");
      assert.strictEqual(result[getEdgeKey(edges[1])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[2])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[3])], "skipped");
    });

    it("skips all outgoing edges when branch is unknown and no matching handle exists", () => {
      const edges: WorkflowEdge[] = [
        { source: "IF", target: "A", sourceHandle: "true" },
        { source: "IF", target: "B", sourceHandle: "false" },
        { source: "IF", target: "C" }, // default
      ];

      const result = resolveOutgoingEdgeStates(edges, "unknown");

      assert.strictEqual(result[getEdgeKey(edges[0])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[1])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[2])], "skipped");
    });

    it("skips all outgoing edges when branch is empty string ''", () => {
      const edges: WorkflowEdge[] = [
        { source: "IF", target: "A" }, // default
        { source: "IF", target: "B", sourceHandle: "" }, // default
        { source: "IF", target: "C", sourceHandle: "default" }, // default
        { source: "IF", target: "D", sourceHandle: "true" }, // named
      ];

      const result = resolveOutgoingEdgeStates(edges, "");

      // Empty string branch must NOT activate default edges or any named edges
      assert.strictEqual(result[getEdgeKey(edges[0])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[1])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[2])], "skipped");
      assert.strictEqual(result[getEdgeKey(edges[3])], "skipped");
    });

    it("activates all edges when multiple outgoing edges have the same selected sourceHandle", () => {
      const edges: WorkflowEdge[] = [
        { source: "IF", target: "A", sourceHandle: "true" },
        { source: "IF", target: "B", sourceHandle: "true" },
        { source: "IF", target: "C", sourceHandle: "false" },
      ];

      const result = resolveOutgoingEdgeStates(edges, "true");

      assert.strictEqual(result[getEdgeKey(edges[0])], "active");
      assert.strictEqual(result[getEdgeKey(edges[1])], "active");
      assert.strictEqual(result[getEdgeKey(edges[2])], "skipped");
    });

    it("handles mixed default and named handles correctly when branch is specified vs unspecified", () => {
      const edges: WorkflowEdge[] = [
        { source: "N", target: "D1" },
        { source: "N", target: "B1", sourceHandle: "alt" },
      ];

      // With branch: "alt"
      const altResult = resolveOutgoingEdgeStates(edges, "alt");
      assert.strictEqual(altResult[getEdgeKey(edges[0])], "skipped");
      assert.strictEqual(altResult[getEdgeKey(edges[1])], "active");

      // Without branch
      const defResult = resolveOutgoingEdgeStates(edges, undefined);
      assert.strictEqual(defResult[getEdgeKey(edges[0])], "active");
      assert.strictEqual(defResult[getEdgeKey(edges[1])], "skipped");
    });
  });

  describe("Workflow-level Branching Execution", () => {
    it("should execute true branch and skip false branch and downstream nodes", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            executed.push("IF");
            return { success: true, output: { ok: true }, branch: "true" };
          },
        },
        nodeA: {
          async execute(p) {
            executed.push("A");
            return { success: true, output: `A got: ${JSON.stringify(p.input)}` };
          },
        },
        nodeB: {
          async execute() {
            executed.push("B");
            return { success: true, output: "B should not run" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-branch-true",
        name: "Branch True",
        nodes: [
          { id: "IF", type: "cond", config: {} },
          { id: "A", type: "nodeA", config: {} },
          { id: "B", type: "nodeB", config: {} },
        ],
        edges: [
          { source: "IF", target: "A", sourceHandle: "true" },
          { source: "IF", target: "B", sourceHandle: "false" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["IF", "A"]);
      assert.strictEqual(summary.nodeStates["IF"], "completed");
      assert.strictEqual(summary.nodeStates["A"], "completed");
      assert.strictEqual(summary.nodeStates["B"], "skipped");
      assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[0])], "active");
      assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[1])], "skipped");
    });

    it("should execute false branch and skip true branch and downstream nodes", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            executed.push("IF");
            return { success: true, output: { ok: false }, branch: "false" };
          },
        },
        nodeA: {
          async execute() {
            executed.push("A");
            return { success: true, output: "A should not run" };
          },
        },
        nodeB: {
          async execute(p) {
            executed.push("B");
            return { success: true, output: `B got: ${JSON.stringify(p.input)}` };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-branch-false",
        name: "Branch False",
        nodes: [
          { id: "IF", type: "cond", config: {} },
          { id: "A", type: "nodeA", config: {} },
          { id: "B", type: "nodeB", config: {} },
        ],
        edges: [
          { source: "IF", target: "A", sourceHandle: "true" },
          { source: "IF", target: "B", sourceHandle: "false" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["IF", "B"]);
      assert.strictEqual(summary.nodeStates["IF"], "completed");
      assert.strictEqual(summary.nodeStates["A"], "skipped");
      assert.strictEqual(summary.nodeStates["B"], "completed");
      assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[0])], "skipped");
      assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[1])], "active");
    });

    it("should handle branch convergence/fan-in where only active branch contributes input", async () => {
      let mergeInput: unknown = undefined;

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            return { success: true, output: "root-val", branch: "true" };
          },
        },
        trueBranch: {
          async execute() {
            return { success: true, output: { branchOutput: "from-true" } };
          },
        },
        falseBranch: {
          async execute() {
            return { success: true, output: { branchOutput: "from-false" } };
          },
        },
        mergeNode: {
          async execute(p) {
            mergeInput = p.input;
            return { success: true, output: "done" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-convergence",
        name: "Convergence",
        nodes: [
          { id: "IF", type: "cond", config: {} },
          { id: "A", type: "trueBranch", config: {} },
          { id: "B", type: "falseBranch", config: {} },
          { id: "C", type: "mergeNode", config: {} },
        ],
        edges: [
          { source: "IF", target: "A", sourceHandle: "true" },
          { source: "IF", target: "B", sourceHandle: "false" },
          { source: "A", target: "C" },
          { source: "B", target: "C" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.strictEqual(summary.nodeStates["A"], "completed");
      assert.strictEqual(summary.nodeStates["B"], "skipped");
      assert.strictEqual(summary.nodeStates["C"], "completed");
      // C only received single active input from A directly, B is completely excluded
      assert.deepStrictEqual(mergeInput, { branchOutput: "from-true" });
    });

    it("should execute multi-target fan-out from the same selected sourceHandle", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            return { success: true, output: "broadcast-payload", branch: "notify" };
          },
        },
        worker1: {
          async execute(p) {
            executed.push(`w1:${p.input}`);
            return { success: true, output: "w1-done" };
          },
        },
        worker2: {
          async execute(p) {
            executed.push(`w2:${p.input}`);
            return { success: true, output: "w2-done" };
          },
        },
        worker3: {
          async execute() {
            executed.push("w3");
            return { success: true, output: "w3-done" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-multi-fanout",
        name: "Multi Fanout",
        nodes: [
          { id: "IF", type: "cond", config: {} },
          { id: "W1", type: "worker1", config: {} },
          { id: "W2", type: "worker2", config: {} },
          { id: "W3", type: "worker3", config: {} },
        ],
        edges: [
          { source: "IF", target: "W1", sourceHandle: "notify" },
          { source: "IF", target: "W2", sourceHandle: "notify" },
          { source: "IF", target: "W3", sourceHandle: "other" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["w1:broadcast-payload", "w2:broadcast-payload"]);
      assert.strictEqual(summary.nodeStates["W1"], "completed");
      assert.strictEqual(summary.nodeStates["W2"], "completed");
      assert.strictEqual(summary.nodeStates["W3"], "skipped");
    });

    it("should cascade multi-level skips across downstream nodes", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        root: {
          async execute() {
            executed.push("root");
            return { success: true, output: "root", branch: "active-branch" };
          },
        },
        step1: {
          async execute() {
            executed.push("step1");
            return { success: true, output: "step1" };
          },
        },
        step2: {
          async execute() {
            executed.push("step2");
            return { success: true, output: "step2" };
          },
        },
        step3: {
          async execute() {
            executed.push("step3");
            return { success: true, output: "step3" };
          },
        },
      };

      // root --(skipped-branch)--> step1 --> step2 --> step3
      const workflow: Workflow = {
        id: "wf-deep-skip",
        name: "Deep Cascade Skip",
        nodes: [
          { id: "root", type: "root", config: {} },
          { id: "step1", type: "step1", config: {} },
          { id: "step2", type: "step2", config: {} },
          { id: "step3", type: "step3", config: {} },
        ],
        edges: [
          { source: "root", target: "step1", sourceHandle: "dormant-branch" },
          { source: "step1", target: "step2" },
          { source: "step2", target: "step3" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["root"]);
      assert.strictEqual(summary.nodeStates["step1"], "skipped");
      assert.strictEqual(summary.nodeStates["step2"], "skipped");
      assert.strictEqual(summary.nodeStates["step3"], "skipped");
    });

    it("should skip all downstream nodes when node emits an unknown branch", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            executed.push("cond");
            return { success: true, output: "test", branch: "non-existent" };
          },
        },
        targetA: {
          async execute() {
            executed.push("targetA");
            return { success: true, output: "A" };
          },
        },
        targetB: {
          async execute() {
            executed.push("targetB");
            return { success: true, output: "B" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-unknown-branch",
        name: "Unknown Branch",
        nodes: [
          { id: "cond", type: "cond", config: {} },
          { id: "targetA", type: "targetA", config: {} },
          { id: "targetB", type: "targetB", config: {} },
        ],
        edges: [
          { source: "cond", target: "targetA", sourceHandle: "true" },
          { source: "cond", target: "targetB" }, // default
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["cond"]);
      assert.strictEqual(summary.nodeStates["targetA"], "skipped");
      assert.strictEqual(summary.nodeStates["targetB"], "skipped");
    });

    it("should skip all downstream nodes when node emits an empty string branch ''", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        cond: {
          async execute() {
            executed.push("cond");
            return { success: true, output: "test", branch: "" };
          },
        },
        targetA: {
          async execute() {
            executed.push("targetA");
            return { success: true, output: "A" };
          },
        },
        targetB: {
          async execute() {
            executed.push("targetB");
            return { success: true, output: "B" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-empty-branch",
        name: "Empty Branch",
        nodes: [
          { id: "cond", type: "cond", config: {} },
          { id: "targetA", type: "targetA", config: {} },
          { id: "targetB", type: "targetB", config: {} },
        ],
        edges: [
          { source: "cond", target: "targetA", sourceHandle: "true" },
          { source: "cond", target: "targetB" }, // default
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.deepStrictEqual(executed, ["cond"]);
      assert.strictEqual(summary.nodeStates["targetA"], "skipped");
      assert.strictEqual(summary.nodeStates["targetB"], "skipped");
    });

    it("guarantees skipped branches never contribute input to subsequent nodes", async () => {
      let collectedInput: unknown = "not-called";

      const handlers: Record<string, NodeHandler> = {
        root: {
          async execute() {
            return { success: true, output: { key: "root-data" }, branch: "skip-me" };
          },
        },
        deadNode: {
          async execute() {
            return { success: true, output: { secret: "should-never-leak" } };
          },
        },
        collector: {
          async execute(p) {
            collectedInput = p.input;
            return { success: true, output: "collected" };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-isolation",
        name: "Branch Isolation",
        nodes: [
          { id: "root", type: "root", config: {} },
          { id: "deadNode", type: "deadNode", config: {} },
          { id: "collector", type: "collector", config: {} },
        ],
        edges: [
          { source: "root", target: "deadNode", sourceHandle: "other-branch" },
          { source: "deadNode", target: "collector" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "completed");
      assert.strictEqual(summary.nodeStates["deadNode"], "skipped");
      assert.strictEqual(summary.nodeStates["collector"], "skipped");
      assert.strictEqual(collectedInput, "not-called");
      assert.strictEqual(summary.context.nodeOutputs["deadNode"], undefined);
    });
  });
});
