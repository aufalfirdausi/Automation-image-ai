import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateWorkflow } from "../src/engine/validate-workflow.js";
import type { Workflow } from "../src/engine/types.js";

describe("validateWorkflow", () => {
  it("should validate a valid linear workflow successfully", () => {
    const workflow: Workflow = {
      id: "wf-linear-1",
      name: "Linear Pipeline",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
        { id: "node-2", type: "transform", config: { operation: "uppercase" } },
        { id: "node-3", type: "output", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, []);
  });

  it("should validate a valid branching workflow with sourceHandle", () => {
    const workflow: Workflow = {
      id: "wf-branch-1",
      name: "Branching Pipeline",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
        { id: "node-cond", type: "condition", config: { expression: "x > 10" } },
        { id: "node-true", type: "action", config: { result: "positive" } },
        { id: "node-false", type: "action", config: { result: "negative" } },
      ],
      edges: [
        { source: "node-1", target: "node-cond" },
        { source: "node-cond", target: "node-true", sourceHandle: "true" },
        { source: "node-cond", target: "node-false", sourceHandle: "false" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, []);
  });

  it("should detect duplicate node IDs", () => {
    const workflow: Workflow = {
      id: "wf-dup-1",
      name: "Duplicate Nodes Workflow",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
        { id: "node-1", type: "transform", config: {} },
      ],
      edges: [],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(
      result.errors.some((err) => err.includes("Duplicate node ID: 'node-1'")),
      "Expected duplicate node error"
    );
  });

  it("should detect edge referencing a missing source node", () => {
    const workflow: Workflow = {
      id: "wf-missing-src",
      name: "Missing Source Workflow",
      nodes: [
        { id: "node-2", type: "transform", config: {} },
      ],
      edges: [
        { source: "node-missing", target: "node-2" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(
      result.errors.some((err) =>
        err.includes("Edge source 'node-missing' references a non-existent node")
      ),
      "Expected missing edge source error"
    );
  });

  it("should detect edge referencing a missing target node", () => {
    const workflow: Workflow = {
      id: "wf-missing-tgt",
      name: "Missing Target Workflow",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-missing" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(
      result.errors.some((err) =>
        err.includes("Edge target 'node-missing' references a non-existent node")
      ),
      "Expected missing edge target error"
    );
  });

  it("should detect cyclic workflow graphs", () => {
    const workflow: Workflow = {
      id: "wf-cycle-1",
      name: "Cyclic Workflow",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
        { id: "node-2", type: "transform", config: {} },
        { id: "node-3", type: "transform", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-2" },
        { source: "node-2", target: "node-3" },
        { source: "node-3", target: "node-1" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(
      result.errors.some((err) =>
        err.includes("Cyclic dependency detected: node-1 -> node-2 -> node-3 -> node-1")
      ),
      "Expected cycle detection error"
    );
  });

  it("should detect self-referencing edge cycle", () => {
    const workflow: Workflow = {
      id: "wf-self-cycle",
      name: "Self Loop Workflow",
      nodes: [
        { id: "node-1", type: "manual_trigger", config: {} },
      ],
      edges: [
        { source: "node-1", target: "node-1" },
      ],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(
      result.errors.some((err) =>
        err.includes("Self-referencing cycle detected: node 'node-1' connects to itself")
      ),
      "Expected self-loop cycle error"
    );
  });

  it("should reject workflow with empty id or name", () => {
    const workflow: Workflow = {
      id: "",
      name: "   ",
      nodes: [],
      edges: [],
    };

    const result = validateWorkflow(workflow);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((err) => err.includes("valid non-empty 'id'")));
    assert.ok(result.errors.some((err) => err.includes("valid non-empty 'name'")));
  });
});
