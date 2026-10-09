import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createExecutionContext,
  recordNodeOutput,
  executeNode,
  type NodeHandler,
  type NodeExecutionParams,
} from "../src/engine/index.js";

describe("ExecutionContext & Node Execution Contract", () => {
  describe("createExecutionContext", () => {
    it("should create initial execution context with default generated values", () => {
      const context = createExecutionContext("wf-1");

      assert.equal(context.workflowId, "wf-1");
      assert.ok(typeof context.executionId === "string" && context.executionId.length > 0);
      assert.ok(typeof context.startedAt === "string" && context.startedAt.length > 0);
      assert.deepEqual(context.nodeOutputs, {});
      assert.equal(context.metadata, undefined);
    });

    it("should create execution context with deterministic options", () => {
      const context = createExecutionContext("wf-custom", {
        executionId: "exec-fixed-123",
        startedAt: "2026-09-28T23:00:00.000Z",
        metadata: { trigger: "manual" },
        nodeOutputs: { "pre-node": { initialized: true } },
      });

      assert.equal(context.workflowId, "wf-custom");
      assert.equal(context.executionId, "exec-fixed-123");
      assert.equal(context.startedAt, "2026-09-28T23:00:00.000Z");
      assert.deepEqual(context.nodeOutputs, { "pre-node": { initialized: true } });
      assert.deepEqual(context.metadata, { trigger: "manual" });
    });
  });

  describe("recordNodeOutput & immutability", () => {
    it("should return a new context with the recorded node output", () => {
      const initial = createExecutionContext("wf-1", { executionId: "exec-1" });
      const updated = recordNodeOutput(initial, "node-1", { topic: "JavaScript" });

      assert.notEqual(initial, updated, "Must return a new reference");
      assert.deepEqual(updated.nodeOutputs, {
        "node-1": { topic: "JavaScript" },
      });
      assert.equal(updated.executionId, "exec-1");
      assert.equal(updated.workflowId, "wf-1");
    });

    it("should preserve original context immutably without side effects", () => {
      const initial = createExecutionContext("wf-1");
      const updated1 = recordNodeOutput(initial, "node-a", { val: 1 });
      const updated2 = recordNodeOutput(updated1, "node-b", { val: 2 });

      // Initial context remains completely empty
      assert.deepEqual(initial.nodeOutputs, {});
      // updated1 only contains node-a
      assert.deepEqual(updated1.nodeOutputs, { "node-a": { val: 1 } });
      // updated2 contains both node-a and node-b
      assert.deepEqual(updated2.nodeOutputs, {
        "node-a": { val: 1 },
        "node-b": { val: 2 },
      });

      // Context and nodeOutputs must be runtime frozen
      assert.equal(Object.isFrozen(initial), true);
      assert.equal(Object.isFrozen(initial.nodeOutputs), true);
      assert.equal(Object.isFrozen(updated1), true);
      assert.equal(Object.isFrozen(updated1.nodeOutputs), true);

      // Direct property assignment to frozen nodeOutputs must throw TypeError in strict mode
      assert.throws(() => {
        "use strict";
        // @ts-expect-error - testing runtime immutability on frozen object
        initial.nodeOutputs["stray-node"] = { illegal: true };
      }, TypeError);
    });
  });

  describe("executeNode", () => {
    it("should successfully execute a node handler and return its output", async () => {
      const handler: NodeHandler<{ multiplier: number }, { value: number }, { result: number }> = {
        async execute(params) {
          return {
            success: true,
            output: { result: params.input.value * params.config.multiplier },
          };
        },
      };

      const context = createExecutionContext("wf-1");
      const params: NodeExecutionParams<{ multiplier: number }, { value: number }> = {
        nodeId: "node-calc",
        config: { multiplier: 3 },
        input: { value: 10 },
        context,
      };

      const result = await executeNode(handler, params);
      assert.equal(result.success, true);
      assert.deepEqual(result.output, { result: 30 });
      assert.equal(result.error, undefined);
    });

    it("should preserve explicit node execution failure", async () => {
      const handler: NodeHandler = {
        async execute() {
          return {
            success: false,
            error: {
              message: "Invalid configuration provided",
              code: "CONFIG_ERROR",
              details: { missingField: "apiKey" },
            },
          };
        },
      };

      const context = createExecutionContext("wf-1");
      const params: NodeExecutionParams = {
        nodeId: "node-fail",
        config: {},
        input: null,
        context,
      };

      const result = await executeNode(handler, params);
      assert.equal(result.success, false);
      assert.equal(result.output, undefined);
      assert.deepEqual(result.error, {
        message: "Invalid configuration provided",
        code: "CONFIG_ERROR",
        details: { missingField: "apiKey" },
      });
    });

    it("should normalize unexpected thrown exceptions into NodeExecutionError", async () => {
      const handler: NodeHandler = {
        async execute() {
          throw new Error("Unexpected database connection crash");
        },
      };

      const context = createExecutionContext("wf-1");
      const params: NodeExecutionParams = {
        nodeId: "node-throw",
        config: {},
        input: null,
        context,
      };

      const result = await executeNode(handler, params);
      assert.equal(result.success, false);
      assert.equal(result.output, undefined);
      assert.equal(result.error?.message, "Unexpected database connection crash");
      assert.equal(result.error?.code, "NODE_EXECUTION_EXCEPTION");
      assert.ok(typeof result.error?.details === "string", "Expected stack trace in details");
    });

    it("should normalize non-Error thrown values", async () => {
      const handler: NodeHandler = {
        async execute() {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "Raw string failure";
        },
      };

      const context = createExecutionContext("wf-1");
      const params: NodeExecutionParams = {
        nodeId: "node-throw-str",
        config: {},
        input: null,
        context,
      };

      const result = await executeNode(handler, params);
      assert.equal(result.success, false);
      assert.equal(result.error?.message, "Raw string failure");
      assert.equal(result.error?.code, "NODE_EXECUTION_EXCEPTION");
    });

    it("should support and preserve optional branch discriminator in result", async () => {
      const handler: NodeHandler = {
        async execute() {
          return {
            success: true,
            output: { conditionMet: true },
            branch: "true",
          };
        },
      };

      const context = createExecutionContext("wf-1");
      const params: NodeExecutionParams = {
        nodeId: "node-branch",
        config: {},
        input: null,
        context,
      };

      const result = await executeNode(handler, params);
      assert.equal(result.success, true);
      assert.deepEqual(result.output, { conditionMet: true });
      assert.equal(result.branch, "true");
    });
  });
});
