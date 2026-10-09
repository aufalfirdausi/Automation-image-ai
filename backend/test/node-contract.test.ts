import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultNodeRegistry, registerCoreNodes } from "../src/nodes/index.js";
import { validateNodeConfig } from "../src/nodes/validate-config.js";

describe("Phase 4.4: Node Contract Validation Suite", () => {
  // Ensure default registry is populated with core nodes
  registerCoreNodes();
  const manifests = defaultNodeRegistry.listManifests();

  it("1. All registered nodes have valid manifests meeting contract specification", () => {
    assert.ok(manifests.length >= 4, "Expected at least 4 core nodes registered");

    const validCategories = ["trigger", "utility", "ai", "data", "logic"];
    const semverRegex = /^\d+\.\d+\.\d+$/;

    for (const manifest of manifests) {
      assert.ok(manifest.type && manifest.type.trim().length > 0, `Manifest must have non-empty type`);
      assert.ok(manifest.name && manifest.name.trim().length > 0, `Node ${manifest.type} must have non-empty name`);
      assert.match(manifest.version, semverRegex, `Node ${manifest.type} version '${manifest.version}' must follow semver (e.g. 1.0.0)`);
      assert.ok(validCategories.includes(manifest.category), `Node ${manifest.type} category '${manifest.category}' is invalid`);
      assert.ok(typeof manifest.description === "string", `Node ${manifest.type} description must be string`);

      // Ports validation
      assert.ok(Array.isArray(manifest.inputs), `Node ${manifest.type} inputs must be array`);
      assert.ok(Array.isArray(manifest.outputs), `Node ${manifest.type} outputs must be array`);

      const inputIds = new Set<string>();
      for (const input of manifest.inputs) {
        assert.ok(input.id && input.id.trim().length > 0, `Node ${manifest.type} input id cannot be empty`);
        assert.ok(input.label && input.label.trim().length > 0, `Node ${manifest.type} input label cannot be empty`);
        assert.ok(!inputIds.has(input.id), `Node ${manifest.type} has duplicate input id: ${input.id}`);
        inputIds.add(input.id);
      }

      const outputIds = new Set<string>();
      for (const output of manifest.outputs) {
        assert.ok(output.id && output.id.trim().length > 0, `Node ${manifest.type} output id cannot be empty`);
        assert.ok(output.label && output.label.trim().length > 0, `Node ${manifest.type} output label cannot be empty`);
        assert.ok(!outputIds.has(output.id), `Node ${manifest.type} has duplicate output id: ${output.id}`);
        outputIds.add(output.id);
      }

      // Config fields validation
      assert.ok(Array.isArray(manifest.configFields), `Node ${manifest.type} configFields must be array`);
      const fieldNames = new Set<string>();
      const validFieldTypes = ["string", "number", "boolean", "select", "json"];

      for (const field of manifest.configFields) {
        assert.ok(field.name && field.name.trim().length > 0, `Node ${manifest.type} configField name cannot be empty`);
        assert.ok(field.label && field.label.trim().length > 0, `Node ${manifest.type} configField label cannot be empty`);
        assert.ok(validFieldTypes.includes(field.type), `Node ${manifest.type} configField type '${field.type}' is invalid`);
        assert.ok(!fieldNames.has(field.name), `Node ${manifest.type} duplicate configField name: ${field.name}`);
        fieldNames.add(field.name);

        if (field.type === "select") {
          assert.ok(Array.isArray(field.options) && field.options.length > 0, `Select field ${field.name} in ${manifest.type} must have options`);
          for (const opt of field.options) {
            assert.ok(opt.label && opt.value !== undefined, `Select option in ${field.name} must have label and value`);
          }
        }
      }
    }
  });

  it("2. All registered nodes have corresponding executable handlers in registry", () => {
    for (const manifest of manifests) {
      const definition = defaultNodeRegistry.getDefinition(manifest.type);
      assert.ok(definition, `Registry must return definition for ${manifest.type}`);
      assert.ok(definition.handler, `Definition for ${manifest.type} must have handler`);
      assert.strictEqual(typeof definition.handler.execute, "function", `Handler execute for ${manifest.type} must be a function`);
    }
  });

  it("3. Config validation works accurately for all registered node manifests with default/valid values", () => {
    for (const manifest of manifests) {
      const validConfig: Record<string, unknown> = {};

      for (const field of manifest.configFields) {
        if (field.defaultValue !== undefined) {
          validConfig[field.name] = field.defaultValue;
        } else if (field.required) {
          switch (field.type) {
            case "string":
              validConfig[field.name] = "test-string";
              break;
            case "number":
              validConfig[field.name] = 42;
              break;
            case "boolean":
              validConfig[field.name] = true;
              break;
            case "select":
              validConfig[field.name] = field.options?.[0]?.value ?? "option";
              break;
            case "json":
              validConfig[field.name] = { key: "value" };
              break;
          }
        }
      }

      const result = validateNodeConfig(manifest, validConfig);
      assert.strictEqual(result.isValid, true, `Validation failed for node ${manifest.type} with valid config: ${JSON.stringify(result.errors)}`);
    }
  });
});
