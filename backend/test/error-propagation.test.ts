import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Workflow, WorkflowEdge } from "../src/engine/types.js";
import type { NodeHandler, NodeExecutionParams } from "../src/engine/execution-types.js";
import { executeNode } from "../src/engine/execute-node.js";
import { executeWorkflow } from "../src/engine/runner.js";
import { createExecutionContext } from "../src/engine/context.js";
import { getEdgeKey } from "../src/engine/runner-types.js";

describe("Phase 2.7: Error Propagation", () => {
  const dummyContext = createExecutionContext("wf-test");

  describe("executeNode - Node-level Error Normalization", () => {
    // Test A: success: false with explicit custom error
    it("A. preserves explicit custom NodeExecutionError when success: false", async () => {
      const handler: NodeHandler = {
        async execute() {
          return {
            success: false,
            error: {
              message: "Custom DB failure",
              code: "DATABASE_CONNECTION_REFUSED",
              details: { host: "localhost", port: 3306 },
            },
          };
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "db-node",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output, undefined);
      assert.deepStrictEqual(result.error, {
        message: "Custom DB failure",
        code: "DATABASE_CONNECTION_REFUSED",
        details: { host: "localhost", port: 3306 },
      });
    });

    // Test B: success: false without error
    it("B. generates NODE_EXECUTION_FAILED when success: false without error", async () => {
      const handler: NodeHandler = {
        async execute() {
          return { success: false };
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "failing-node",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output, undefined);
      assert.deepStrictEqual(result.error, {
        message: "Node 'failing-node' execution failed",
        code: "NODE_EXECUTION_FAILED",
      });
    });

    // Test C: success: true with output + extraneous error
    it("C. treats success: true as authoritative, commits output, and ignores extraneous error", async () => {
      const handler: NodeHandler = {
        async execute() {
          return {
            success: true,
            output: { answer: 42 },
            error: {
              message: "Harmless warning",
              code: "WARN",
            },
          };
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "success-with-err",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.output, { answer: 42 });
      assert.strictEqual(result.error, undefined);
    });

    // Test D: success: false with output but no error
    it("D. discards output and generates NODE_EXECUTION_FAILED when success: false with output", async () => {
      const handler: NodeHandler = {
        async execute() {
          return {
            success: false,
            output: { partial: "data" },
          };
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "partial-node",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output, undefined);
      assert.deepStrictEqual(result.error, {
        message: "Node 'partial-node' execution failed",
        code: "NODE_EXECUTION_FAILED",
      });
    });

    // Test E: throw Error("boom")
    it("E. normalizes thrown Error to NODE_EXECUTION_EXCEPTION with message and stack in details", async () => {
      const errorInstance = new Error("boom");
      const handler: NodeHandler = {
        async execute() {
          throw errorInstance;
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "boom-node",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output, undefined);
      assert.strictEqual(result.error?.message, "boom");
      assert.strictEqual(result.error?.code, "NODE_EXECUTION_EXCEPTION");
      assert.strictEqual(result.error?.details, errorInstance.stack);
    });

    // Test F: throw string
    it("F. normalizes thrown string to NODE_EXECUTION_EXCEPTION", async () => {
      const handler: NodeHandler = {
        async execute() {
          throw "string error message";
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "string-thrower",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output, undefined);
      assert.strictEqual(result.error?.message, "string error message");
      assert.strictEqual(result.error?.code, "NODE_EXECUTION_EXCEPTION");
      assert.strictEqual(result.error?.details, undefined);
    });

    // Test G: throw non-Error primitive (e.g., number, null)
    it("G. normalizes thrown non-Error primitive to NODE_EXECUTION_EXCEPTION", async () => {
      const handler: NodeHandler = {
        async execute() {
          throw 404;
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "number-thrower",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.message, "404");
      assert.strictEqual(result.error?.code, "NODE_EXECUTION_EXCEPTION");
    });

    // Test H: invalid handler result: null
    it("H. normalizes null handler return to INVALID_HANDLER_RESULT", async () => {
      const handler: NodeHandler = {
        // @ts-expect-error - simulating invalid handler return
        async execute() {
          return null;
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "null-returner",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, "INVALID_HANDLER_RESULT");
      assert.strictEqual(result.error?.details, null);
    });

    // Test I: invalid handler result: undefined
    it("I. normalizes undefined handler return to INVALID_HANDLER_RESULT", async () => {
      const handler: NodeHandler = {
        // @ts-expect-error - simulating invalid handler return
        async execute() {
          return undefined;
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "undef-returner",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, "INVALID_HANDLER_RESULT");
      assert.strictEqual(result.error?.details, undefined);
    });

    // Test J: invalid handler result: {}
    it("J. normalizes empty object without boolean success to INVALID_HANDLER_RESULT", async () => {
      const handler: NodeHandler = {
        // @ts-expect-error - simulating invalid handler return
        async execute() {
          return {};
        },
      };

      const params: NodeExecutionParams = {
        nodeId: "empty-returner",
        config: {},
        input: null,
        context: dummyContext,
      };

      const result = await executeNode(handler, params);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, "INVALID_HANDLER_RESULT");
    });
  });

  describe("Workflow-level Error Propagation", () => {
    // Test K, L, M: A -> B -> C where B fails, B -> C is blocked, C never executes
    it("K, L, M. propagates failure in A -> B -> C: B fails, edge B -> C becomes blocked, C never executes", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        nodeA: {
          async execute() {
            executed.push("A");
            return { success: true, output: "A-result" };
          },
        },
        nodeB: {
          async execute() {
            executed.push("B");
            return {
              success: false,
              error: {
                message: "B crashed",
                code: "CRASH_B",
              },
            };
          },
        },
        nodeC: {
          async execute() {
            executed.push("C");
            return { success: true, output: "C-result" };
          },
        },
      };

      const edgeBC: WorkflowEdge = { source: "B", target: "C" };
      const workflow: Workflow = {
        id: "wf-abc",
        name: "ABC Failure",
        nodes: [
          { id: "A", type: "nodeA", config: {} },
          { id: "B", type: "nodeB", config: {} },
          { id: "C", type: "nodeC", config: {} },
        ],
        edges: [
          { source: "A", target: "B" },
          edgeBC,
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      // Status
      assert.strictEqual(summary.status, "failed");
      assert.deepStrictEqual(executed, ["A", "B"]); // C never executed

      // Node states
      assert.strictEqual(summary.nodeStates["A"], "completed");
      assert.strictEqual(summary.nodeStates["B"], "failed");
      assert.strictEqual(summary.nodeStates["C"], "pending"); // remaining downstream unexecuted

      // Edge states
      assert.strictEqual(summary.edgeStates[getEdgeKey(edgeBC)], "blocked");

      // Root error captured in summary
      assert.deepStrictEqual(summary.error, {
        message: "B crashed",
        code: "CRASH_B",
      });
    });

    // Test N: Multiple roots where one branch fails
    it("N. stops execution across independent roots when one branch fails (fail-fast)", async () => {
      const executed: string[] = [];

      const handlers: Record<string, NodeHandler> = {
        rootA: {
          async execute() {
            executed.push("rootA");
            return { success: true, output: "rootA-data" };
          },
        },
        rootB: {
          async execute() {
            executed.push("rootB");
            return {
              success: false,
              error: { message: "rootB failed", code: "ROOT_B_FAILED" },
            };
          },
        },
        childA: {
          async execute() {
            executed.push("childA");
            return { success: true, output: "childA-data" };
          },
        },
        childB: {
          async execute() {
            executed.push("childB");
            return { success: true, output: "childB-data" };
          },
        },
      };

      // root-1 -> child-1
      // root-2 -> child-2
      // Initial ready queue: ["root-1", "root-2"]
      // 1. root-1 executes, succeeds -> readyQueue becomes ["child-1", "root-2"] (sorted: ["child-1", "root-2"])
      // But notice: "child-1" < "root-2"!
      // To test fail-fast aborting queued children:
      // Let root-1 succeed and queue z-child-1, root-2 fail:
      // Initial queue: ["root-1", "root-2"]
      // root-1 runs, queues "z-child-1" -> queue: ["root-2", "z-child-1"]
      // root-2 runs, fails -> readyQueue cleared! "z-child-1" and "z-child-2" never run!
      const workflow: Workflow = {
        id: "wf-roots",
        name: "Multi-Root Failure",
        nodes: [
          { id: "root-1", type: "rootA", config: {} },
          { id: "root-2", type: "rootB", config: {} },
          { id: "z-child-1", type: "childA", config: {} },
          { id: "z-child-2", type: "childB", config: {} },
        ],
        edges: [
          { source: "root-1", target: "z-child-1" },
          { source: "root-2", target: "z-child-2" },
        ],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "failed");
      // root-1 runs, adds z-child-1 to readyQueue.
      // Next in queue is root-2. root-2 runs and fails.
      // Fail-fast clears readyQueue -> z-child-1 is aborted and never executes!
      assert.deepStrictEqual(executed, ["rootA", "rootB"]);
      assert.strictEqual(summary.nodeStates["root-1"], "completed");
      assert.strictEqual(summary.nodeStates["root-2"], "failed");
      assert.strictEqual(summary.edgeStates[getEdgeKey(workflow.edges[1])], "blocked");
      assert.strictEqual(summary.error?.code, "ROOT_B_FAILED");
    });

    // Test O: Handler not found
    it("O. fails immediately with HANDLER_NOT_FOUND when node handler is missing", async () => {
      const workflow: Workflow = {
        id: "wf-missing-handler",
        name: "Missing Handler",
        nodes: [{ id: "n1", type: "unknown-type", config: {} }],
        edges: [],
      };

      const summary = await executeWorkflow(workflow, {});

      assert.strictEqual(summary.status, "failed");
      assert.strictEqual(summary.nodeStates["n1"], "failed");
      assert.strictEqual(summary.error?.code, "HANDLER_NOT_FOUND");
      assert.ok(summary.error?.message.includes("n1"));
    });

    // Test P: Invalid workflow
    it("P. halts before execution and returns INVALID_WORKFLOW error when workflow is invalid", async () => {
      const workflow: Workflow = {
        id: "wf-cycle",
        name: "Cyclic",
        nodes: [
          { id: "A", type: "t", config: {} },
          { id: "B", type: "t", config: {} },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "B", target: "A" },
        ],
      };

      const summary = await executeWorkflow(workflow, {});

      assert.strictEqual(summary.status, "failed");
      assert.strictEqual(summary.error?.code, "INVALID_WORKFLOW");
      assert.deepStrictEqual(summary.nodeStates, {});
      assert.deepStrictEqual(summary.edgeStates, {});
    });

    // Test Q & R: Failed node absent from context.nodeOutputs; previous successful outputs remain intact
    it("Q, R. guarantees failed node has no output entry while previous successful node outputs remain", async () => {
      const handlers: Record<string, NodeHandler> = {
        nodeA: {
          async execute() {
            return { success: true, output: "valid-output-A" };
          },
        },
        nodeB: {
          async execute() {
            return {
              success: false,
              output: "illegal-leak-B",
              error: { message: "B failed", code: "FAIL_B" },
            };
          },
        },
      };

      const workflow: Workflow = {
        id: "wf-output-check",
        name: "Output Check",
        nodes: [
          { id: "A", type: "nodeA", config: {} },
          { id: "B", type: "nodeB", config: {} },
        ],
        edges: [{ source: "A", target: "B" }],
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "failed");
      // Node A output is preserved
      assert.strictEqual(summary.context.nodeOutputs["A"], "valid-output-A");
      // Node B output is absent (not even undefined or partial)
      assert.strictEqual("B" in summary.context.nodeOutputs, false);
      assert.strictEqual(summary.context.nodeOutputs["B"], undefined);
    });

    // Test S: Summary and maps immutability
    it("S. returns deeply frozen WorkflowExecutionSummary on failure", async () => {
      const workflow: Workflow = {
        id: "wf-freeze",
        name: "Freeze Check",
        nodes: [{ id: "failNode", type: "t", config: {} }],
        edges: [],
      };

      const handlers: Record<string, NodeHandler> = {
        t: {
          async execute() {
            return { success: false, error: { message: "die", code: "ERR" } };
          },
        },
      };

      const summary = await executeWorkflow(workflow, handlers);

      assert.strictEqual(summary.status, "failed");
      assert.ok(Object.isFrozen(summary));
      assert.ok(Object.isFrozen(summary.nodeStates));
      assert.ok(Object.isFrozen(summary.edgeStates));
      assert.ok(Object.isFrozen(summary.context));
      assert.ok(Object.isFrozen(summary.context.nodeOutputs));

      assert.throws(() => {
        "use strict";
        // @ts-expect-error - testing runtime immutability
        summary.status = "completed";
      }, TypeError);
    });
  });
});
