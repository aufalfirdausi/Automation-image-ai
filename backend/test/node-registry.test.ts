import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NodeRegistry } from "../src/nodes/registry.js";
import type { NodeDefinition } from "../src/nodes/types.js";
import { executeWorkflow } from "../src/engine/runner.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 4.1: NodeRegistry & Manifest Contract", () => {
  it("registers a valid node definition and enables lookup", () => {
    const registry = new NodeRegistry();

    const def: NodeDefinition = {
      manifest: {
        type: "test_transform",
        name: "Test Transform",
        version: "1.0.0",
        description: "Transforms test input",
        category: "action",
        inputs: [{ id: "main", label: "Input Data" }],
        outputs: [{ id: "main", label: "Output Data" }],
        configFields: [
          {
            name: "prefix",
            label: "Prefix",
            type: "string",
            defaultValue: "pre_",
          },
        ],
      },
      handler: {
        async execute(params) {
          return {
            success: true,
            output: `transformed: ${String(params.input)}`,
          };
        },
      },
    };

    registry.register(def);

    assert.strictEqual(registry.has("test_transform"), true);
    assert.strictEqual(registry.getDefinition("test_transform"), def);
    assert.strictEqual(registry.getHandler("test_transform"), def.handler);
    assert.deepStrictEqual(registry.getManifest("test_transform"), def.manifest);
  });

  it("throws an explicit error when attempting duplicate node type registration", () => {
    const registry = new NodeRegistry();

    const def1: NodeDefinition = {
      manifest: {
        type: "duplicate_node",
        name: "Node 1",
        version: "1.0.0",
        description: "First instance",
        category: "utility",
        inputs: [],
        outputs: [],
        configFields: [],
      },
      handler: {
        async execute() {
          return { success: true };
        },
      },
    };

    const def2: NodeDefinition = {
      manifest: {
        type: "duplicate_node",
        name: "Node 2",
        version: "2.0.0",
        description: "Second instance",
        category: "utility",
        inputs: [],
        outputs: [],
        configFields: [],
      },
      handler: {
        async execute() {
          return { success: true };
        },
      },
    };

    registry.register(def1);
    assert.throws(
      () => registry.register(def2),
      /Duplicate node type registration: 'duplicate_node' is already registered/
    );
  });

  it("rejects invalid definitions with empty or missing type", () => {
    const registry = new NodeRegistry();

    assert.throws(() => {
      // @ts-expect-error - testing runtime boundary
      registry.register({ manifest: { type: "" } });
    }, /manifest.type is required|cannot be empty/);

    assert.throws(() => {
      // @ts-expect-error - testing runtime boundary
      registry.register({ manifest: { type: "valid_name" }, handler: null });
    }, /handler.execute must be a function/);
  });

  it("safely lists manifests without exposing executable handler functions", () => {
    const registry = new NodeRegistry();

    registry.register({
      manifest: {
        type: "node_alpha",
        name: "Alpha",
        version: "1.0.0",
        description: "Alpha node",
        category: "trigger",
        inputs: [],
        outputs: [{ id: "out", label: "Out" }],
        configFields: [],
      },
      handler: {
        async execute() {
          return { success: true, output: "alpha" };
        },
      },
    });

    const manifests = registry.listManifests();
    assert.strictEqual(manifests.length, 1);
    assert.strictEqual(manifests[0].type, "node_alpha");
    // Ensure no handler property or functions leaked into the manifest list
    assert.strictEqual("handler" in manifests[0], false);
    assert.strictEqual("execute" in manifests[0], false);

    // Serialization verification (pure JSON safety)
    const serialized = JSON.stringify(manifests);
    assert.ok(serialized.includes('"type":"node_alpha"'));
    assert.strictEqual(serialized.includes("function"), false);
  });

  it("integrates seamlessly with Phase 2 runner via toHandlerProvider()", async () => {
    const registry = new NodeRegistry();

    registry.register({
      manifest: {
        type: "greeter",
        name: "Greeter",
        version: "1.0.0",
        description: "Greets input",
        category: "action",
        inputs: [],
        outputs: [],
        configFields: [],
      },
      handler: {
        async execute(params) {
          return { success: true, output: `Hello, ${params.config.target || "World"}!` };
        },
      },
    });

    const workflow: Workflow = {
      id: "wf-registry-run",
      name: "Registry Run Workflow",
      nodes: [{ id: "n1", type: "greeter", config: { target: "Antigravity" } }],
      edges: [],
    };

    // Execute workflow using registry.toHandlerProvider()
    const summary = await executeWorkflow(workflow, registry.toHandlerProvider());

    assert.strictEqual(summary.status, "completed");
    assert.strictEqual(summary.nodeStates["n1"], "completed");
    assert.strictEqual(summary.context.nodeOutputs["n1"], "Hello, Antigravity!");
  });

  it("triggers fail-fast with HANDLER_NOT_FOUND when workflow encounters unregistered node", async () => {
    const registry = new NodeRegistry();

    const workflow: Workflow = {
      id: "wf-missing-run",
      name: "Missing Node Run",
      nodes: [{ id: "unknown_1", type: "unregistered_type", config: {} }],
      edges: [],
    };

    const summary = await executeWorkflow(workflow, registry.toHandlerProvider());

    assert.strictEqual(summary.status, "failed");
    assert.strictEqual(summary.nodeStates["unknown_1"], "failed");
    assert.strictEqual(summary.error?.code, "HANDLER_NOT_FOUND");
    assert.ok(summary.error?.message.includes("unregistered_type"));
  });
});
