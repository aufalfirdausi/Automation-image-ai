import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateNodeConfig } from "../src/nodes/validate-config.js";
import type { NodeManifest } from "../src/nodes/types.js";

describe("Phase 4.2: validateNodeConfig Backend Validator", () => {
  const sampleManifest: NodeManifest = {
    type: "filter_node",
    name: "Filter",
    version: "1.0.0",
    description: "Filters data",
    category: "logic",
    inputs: [],
    outputs: [],
    configFields: [
      {
        name: "targetField",
        label: "Target Field",
        type: "string",
        required: true,
      },
      {
        name: "threshold",
        label: "Threshold",
        type: "number",
        required: true,
      },
      {
        name: "active",
        label: "Is Active",
        type: "boolean",
        required: false,
      },
      {
        name: "mode",
        label: "Filter Mode",
        type: "select",
        options: [
          { label: "Exact", value: "exact" },
          { label: "Contains", value: "contains" },
        ],
        required: true,
      },
      {
        name: "customMetadata",
        label: "Metadata",
        type: "json",
        required: false,
      },
    ],
  };

  it("passes validation for valid configuration payload", () => {
    const validConfig = {
      targetField: "age",
      threshold: 21,
      active: true,
      mode: "exact",
      customMetadata: { tier: "premium" },
    };

    const result = validateNodeConfig(sampleManifest, validConfig);
    assert.strictEqual(result.isValid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it("detects missing required fields", () => {
    const incompleteConfig = {
      active: false,
    };

    const result = validateNodeConfig(sampleManifest, incompleteConfig);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.errors.length, 3);
    const fields = result.errors.map((e) => e.field);
    assert.ok(fields.includes("targetField"));
    assert.ok(fields.includes("threshold"));
    assert.ok(fields.includes("mode"));
  });

  it("detects type mismatches", () => {
    const invalidTypesConfig = {
      targetField: 12345, // should be string
      threshold: "not_a_number", // should be number
      active: "yes", // should be boolean
      mode: "invalid_option", // should be exact or contains
      customMetadata: "not_an_object", // should be json object
    };

    const result = validateNodeConfig(sampleManifest, invalidTypesConfig);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.errors.length, 5);
  });

  it("rejects non-object configuration", () => {
    const result = validateNodeConfig(sampleManifest, "invalid_config_string");
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.errors[0].field, "_root");
  });
});
