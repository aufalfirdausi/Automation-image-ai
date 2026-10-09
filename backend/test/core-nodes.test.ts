import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NodeRegistry } from "../src/nodes/registry.js";
import { registerCoreNodes } from "../src/nodes/core/index.js";
import { executeWorkflow } from "../src/engine/runner.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 4.3: Core Utility Nodes Suite", () => {
  const registry = new NodeRegistry();
  registerCoreNodes(registry);

  it("1. PassThroughNode: passes input directly to output", async () => {
    const handler = registry.getHandler("passthrough");
    assert.ok(handler);

    const result = await handler.execute({
      nodeId: "pass-1",
      config: {},
      input: { data: "test-stream", count: 42 },
      context: {
        executionId: "exec-1",
        workflowId: "wf-1",
        startedAt: new Date().toISOString(),
        nodeOutputs: {},
      },
    });

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, { data: "test-stream", count: 42 });
  });

  it("2. StaticValueNode: emits configured static value", async () => {
    const handler = registry.getHandler("static_value");
    assert.ok(handler);

    const result = await handler.execute({
      nodeId: "static-1",
      config: { value: "my-static-constant" },
      input: null,
      context: {
        executionId: "exec-1",
        workflowId: "wf-1",
        startedAt: new Date().toISOString(),
        nodeOutputs: {},
      },
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, "my-static-constant");
  });

  it("3. TextTransformNode: performs string uppercase, lowercase, and trim operations", async () => {
    const handler = registry.getHandler("text_transform");
    assert.ok(handler);

    const dummyContext = {
      executionId: "exec-1",
      workflowId: "wf-1",
      startedAt: new Date().toISOString(),
      nodeOutputs: {},
    };

    // Uppercase
    const upperRes = await handler.execute({
      nodeId: "text-1",
      config: { operation: "uppercase" },
      input: "hello world",
      context: dummyContext,
    });
    assert.strictEqual(upperRes.output, "HELLO WORLD");

    // Lowercase
    const lowerRes = await handler.execute({
      nodeId: "text-2",
      config: { operation: "lowercase" },
      input: "HELLO WORLD",
      context: dummyContext,
    });
    assert.strictEqual(lowerRes.output, "hello world");

    // Trim
    const trimRes = await handler.execute({
      nodeId: "text-3",
      config: { operation: "trim" },
      input: "   spaced text   ",
      context: dummyContext,
    });
    assert.strictEqual(trimRes.output, "spaced text");
  });

  it("4. ConditionBranchNode: routes to 'true' or 'false' branch based on condition", async () => {
    const handler = registry.getHandler("condition_branch");
    assert.ok(handler);

    const dummyContext = {
      executionId: "exec-1",
      workflowId: "wf-1",
      startedAt: new Date().toISOString(),
      nodeOutputs: {},
    };

    // Truthy test
    const truthyRes = await handler.execute({
      nodeId: "cond-1",
      config: { operator: "truthy" },
      input: "active-value",
      context: dummyContext,
    });
    assert.strictEqual(truthyRes.branch, "true");

    const falsyRes = await handler.execute({
      nodeId: "cond-2",
      config: { operator: "truthy" },
      input: "",
      context: dummyContext,
    });
    assert.strictEqual(falsyRes.branch, "false");

    // Equals test
    const equalsRes = await handler.execute({
      nodeId: "cond-3",
      config: { operator: "equals", compareValue: "expected" },
      input: "expected",
      context: dummyContext,
    });
    assert.strictEqual(equalsRes.branch, "true");

    const notEqualsRes = await handler.execute({
      nodeId: "cond-4",
      config: { operator: "equals", compareValue: "expected" },
      input: "other",
      context: dummyContext,
    });
    assert.strictEqual(notEqualsRes.branch, "false");
  });

  it("5. End-to-end Workflow Execution integrating multiple Core Utility Nodes", async () => {
    // Pipeline: static_value -> text_transform -> condition_branch -> (true) -> passthrough
    const workflow: Workflow = {
      id: "wf-core-nodes-e2e",
      name: "Core Nodes Integration Pipeline",
      nodes: [
        { id: "sourceNode", type: "static_value", config: { value: "   hello engine   " } },
        { id: "trimNode", type: "text_transform", config: { operation: "trim" } },
        { id: "upperNode", type: "text_transform", config: { operation: "uppercase" } },
        { id: "condNode", type: "condition_branch", config: { operator: "equals", compareValue: "HELLO ENGINE" } },
        { id: "passNode", type: "passthrough", config: {} },
        { id: "deadNode", type: "passthrough", config: {} },
      ],
      edges: [
        { source: "sourceNode", target: "trimNode" },
        { source: "trimNode", target: "upperNode" },
        { source: "upperNode", target: "condNode" },
        { source: "condNode", target: "passNode", sourceHandle: "true" },
        { source: "condNode", target: "deadNode", sourceHandle: "false" },
      ],
    };

    const summary = await executeWorkflow(workflow, registry.toHandlerProvider());

    assert.strictEqual(summary.status, "completed");
    assert.strictEqual(summary.nodeStates["sourceNode"], "completed");
    assert.strictEqual(summary.nodeStates["trimNode"], "completed");
    assert.strictEqual(summary.nodeStates["upperNode"], "completed");
    assert.strictEqual(summary.nodeStates["condNode"], "completed");
    assert.strictEqual(summary.nodeStates["passNode"], "completed");
    assert.strictEqual(summary.nodeStates["deadNode"], "skipped");

    assert.strictEqual(summary.context.nodeOutputs["sourceNode"], "   hello engine   ");
    assert.strictEqual(summary.context.nodeOutputs["trimNode"], "hello engine");
    assert.strictEqual(summary.context.nodeOutputs["upperNode"], "HELLO ENGINE");
    assert.deepStrictEqual(summary.context.nodeOutputs["passNode"], { evaluated: true, input: "HELLO ENGINE" });
    assert.strictEqual(summary.context.nodeOutputs["deadNode"], undefined);
  });

  describe("Visual Editor Compatibility Nodes (manual_trigger, action, condition)", () => {
    it("6. NodeRegistry registers manual_trigger, action, and condition", () => {
      assert.ok(registry.has("manual_trigger"));
      assert.ok(registry.has("action"));
      assert.ok(registry.has("condition"));

      assert.strictEqual(registry.getManifest("manual_trigger")?.category, "trigger");
      assert.strictEqual(registry.getManifest("action")?.category, "utility");
      assert.strictEqual(registry.getManifest("condition")?.category, "logic");
    });

    it("7. manual_trigger: emits default payload when no triggerPayload provided", async () => {
      const handler = registry.getHandler("manual_trigger");
      assert.ok(handler);

      const res = await handler.execute({
        nodeId: "trigger-1",
        config: {},
        input: null,
        context: {
          executionId: "exec-1",
          workflowId: "wf-1",
          startedAt: "2026-10-01T00:00:00.000Z",
          nodeOutputs: {},
        },
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.output, {
        triggeredAt: "2026-10-01T00:00:00.000Z",
        manual: true,
      });
    });

    it("8. manual_trigger: preserves triggerPayload from context metadata", async () => {
      const handler = registry.getHandler("manual_trigger");
      assert.ok(handler);

      const res = await handler.execute({
        nodeId: "trigger-1",
        config: {},
        input: null,
        context: {
          executionId: "exec-1",
          workflowId: "wf-1",
          startedAt: "2026-10-01T00:00:00.000Z",
          nodeOutputs: {},
          metadata: {
            triggerPayload: { customParam: "value123", userId: "u-99" },
          },
        },
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.output, { customParam: "value123", userId: "u-99" });
    });

    it("9. action: passes through input directly", async () => {
      const handler = registry.getHandler("action");
      assert.ok(handler);

      const res = await handler.execute({
        nodeId: "act-1",
        config: {},
        input: { data: "sample-input-value" },
        context: {
          executionId: "exec-1",
          workflowId: "wf-1",
          startedAt: "2026-10-01T00:00:00.000Z",
          nodeOutputs: {},
        },
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.output, { data: "sample-input-value" });
    });

    it("10. action: emits config when input is null or undefined", async () => {
      const handler = registry.getHandler("action");
      assert.ok(handler);

      const res = await handler.execute({
        nodeId: "act-1",
        config: { customField: "configured-value" },
        input: null,
        context: {
          executionId: "exec-1",
          workflowId: "wf-1",
          startedAt: "2026-10-01T00:00:00.000Z",
          nodeOutputs: {},
        },
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.output, { customField: "configured-value" });
    });

    it("11. condition: evaluates truthy, equals, and not_equals with exact 'true'/'false' branch", async () => {
      const handler = registry.getHandler("condition");
      assert.ok(handler);

      const dummyCtx = {
        executionId: "exec-1",
        workflowId: "wf-1",
        startedAt: "2026-10-01T00:00:00.000Z",
        nodeOutputs: {},
      };

      // Truthy -> 'true'
      const r1 = await handler.execute({
        nodeId: "c-1",
        config: { operator: "truthy" },
        input: "hello",
        context: dummyCtx,
      });
      assert.strictEqual(r1.branch, "true");
      assert.deepStrictEqual(r1.output, { evaluated: true, input: "hello" });

      // Truthy on falsy value -> 'false'
      const r2 = await handler.execute({
        nodeId: "c-2",
        config: { operator: "truthy" },
        input: null,
        context: dummyCtx,
      });
      assert.strictEqual(r2.branch, "false");
      assert.deepStrictEqual(r2.output, { evaluated: false, input: null });

      // Equals matching -> 'true'
      const r3 = await handler.execute({
        nodeId: "c-3",
        config: { operator: "equals", compareValue: "approved" },
        input: "approved",
        context: dummyCtx,
      });
      assert.strictEqual(r3.branch, "true");

      // Equals non-matching -> 'false'
      const r4 = await handler.execute({
        nodeId: "c-4",
        config: { operator: "equals", compareValue: "approved" },
        input: "rejected",
        context: dummyCtx,
      });
      assert.strictEqual(r4.branch, "false");

      // Not Equals matching -> 'true'
      const r5 = await handler.execute({
        nodeId: "c-5",
        config: { operator: "not_equals", compareValue: "admin" },
        input: "user",
        context: dummyCtx,
      });
      assert.strictEqual(r5.branch, "true");

      // Not Equals non-matching -> 'false'
      const r6 = await handler.execute({
        nodeId: "c-6",
        config: { operator: "not_equals", compareValue: "admin" },
        input: "admin",
        context: dummyCtx,
      });
      assert.strictEqual(r6.branch, "false");
    });

    it("12. End-to-end execution of visual editor graph: manual_trigger -> condition -> action (true & false)", async () => {
      // Test True Branch
      const wfTrue: Workflow = {
        id: "wf-visual-true",
        name: "Visual Graph True Path",
        nodes: [
          { id: "trigger_1", type: "manual_trigger", config: {} },
          { id: "condition_1", type: "condition", config: { operator: "truthy" } },
          { id: "action_true", type: "action", config: { label: "Success" } },
          { id: "action_false", type: "action", config: { label: "Failure" } },
        ],
        edges: [
          { source: "trigger_1", target: "condition_1" },
          { source: "condition_1", target: "action_true", sourceHandle: "true" },
          { source: "condition_1", target: "action_false", sourceHandle: "false" },
        ],
      };

      const summaryTrue = await executeWorkflow(wfTrue, registry.toHandlerProvider(), {
        metadata: { triggerPayload: "active_user_data" },
      });

      assert.strictEqual(summaryTrue.status, "completed");
      assert.strictEqual(summaryTrue.nodeStates["trigger_1"], "completed");
      assert.strictEqual(summaryTrue.nodeStates["condition_1"], "completed");
      assert.strictEqual(summaryTrue.nodeStates["action_true"], "completed");
      assert.strictEqual(summaryTrue.nodeStates["action_false"], "skipped");
      assert.deepStrictEqual(summaryTrue.context.nodeOutputs["action_true"], {
        evaluated: true,
        input: "active_user_data",
      });

      // Test False Branch
      const wfFalse: Workflow = {
        id: "wf-visual-false",
        name: "Visual Graph False Path",
        nodes: [
          { id: "trigger_1", type: "manual_trigger", config: {} },
          { id: "condition_1", type: "condition", config: { operator: "equals", compareValue: "yes" } },
          { id: "action_true", type: "action", config: {} },
          { id: "action_false", type: "action", config: {} },
        ],
        edges: [
          { source: "trigger_1", target: "condition_1" },
          { source: "condition_1", target: "action_true", sourceHandle: "true" },
          { source: "condition_1", target: "action_false", sourceHandle: "false" },
        ],
      };

      const summaryFalse = await executeWorkflow(wfFalse, registry.toHandlerProvider(), {
        metadata: { triggerPayload: "no" },
      });

      assert.strictEqual(summaryFalse.status, "completed");
      assert.strictEqual(summaryFalse.nodeStates["trigger_1"], "completed");
      assert.strictEqual(summaryFalse.nodeStates["condition_1"], "completed");
      assert.strictEqual(summaryFalse.nodeStates["action_true"], "skipped");
      assert.strictEqual(summaryFalse.nodeStates["action_false"], "completed");
    });
  });
});
