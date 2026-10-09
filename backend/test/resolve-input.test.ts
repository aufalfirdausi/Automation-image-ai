import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WorkflowEdge } from "../src/engine/types.js";
import type { EdgeResolutionStatus } from "../src/engine/runner-types.js";
import { getEdgeKey } from "../src/engine/runner-types.js";
import { resolveNodeInput } from "../src/engine/resolve-input.js";

describe("resolveNodeInput", () => {
  it("returns null when incomingEdges is empty", () => {
    const result = resolveNodeInput("node-1", [], {}, {});
    assert.strictEqual(result, null);
  });

  it("returns null when there are zero active incoming edges", () => {
    const edges: WorkflowEdge[] = [
      { source: "n1", target: "n3" },
      { source: "n2", target: "n3" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "skipped",
      [getEdgeKey(edges[1])]: "blocked",
    };
    const nodeOutputs = { n1: { foo: "bar" }, n2: { val: 42 } };

    const result = resolveNodeInput("n3", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, null);
  });

  it("returns predecessor output directly when exactly one active incoming edge", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: { message: "hello world" } };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.deepStrictEqual(result, { message: "hello world" });
  });

  it("returns { [sourceNodeId]: sourceOutput } when multiple active incoming edges", () => {
    const edges: WorkflowEdge[] = [
      { source: "n1", target: "n3" },
      { source: "n2", target: "n3" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
      [getEdgeKey(edges[1])]: "active",
    };
    const nodeOutputs = {
      n1: "output-from-n1",
      n2: 99,
    };

    const result = resolveNodeInput("n3", edges, edgeStates, nodeOutputs);
    assert.deepStrictEqual(result, {
      n1: "output-from-n1",
      n2: 99,
    });
  });

  it("includes only active predecessor outputs when edges are mixed active and skipped", () => {
    const edges: WorkflowEdge[] = [
      { source: "n1", target: "n4" },
      { source: "n2", target: "n4" },
      { source: "n3", target: "n4" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
      [getEdgeKey(edges[1])]: "skipped",
      [getEdgeKey(edges[2])]: "active",
    };
    const nodeOutputs = {
      n1: "from-n1",
      n2: "from-n2-skipped",
      n3: "from-n3",
    };

    const result = resolveNodeInput("n4", edges, edgeStates, nodeOutputs);
    assert.deepStrictEqual(result, {
      n1: "from-n1",
      n3: "from-n3",
    });
  });

  it("excludes blocked edges from input resolution", () => {
    const edges: WorkflowEdge[] = [
      { source: "n1", target: "n3" },
      { source: "n2", target: "n3" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
      [getEdgeKey(edges[1])]: "blocked",
    };
    const nodeOutputs = {
      n1: "allowed",
      n2: "blocked-value",
    };

    const result = resolveNodeInput("n3", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, "allowed");
  });

  it("preserves undefined as predecessor output intact", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs: Record<string, unknown> = { n1: undefined };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, undefined);
  });

  it("preserves null as predecessor output intact", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: null };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, null);
  });

  it("preserves false as predecessor output intact", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: false };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, false);
  });

  it("preserves 0 as predecessor output intact", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: 0 };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, 0);
  });

  it('preserves empty string "" as predecessor output intact', () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: "" };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, "");
  });

  it("preserves array output intact", () => {
    const arr = [1, 2, { a: "b" }];
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: arr };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, arr);
    assert.deepStrictEqual(result, [1, 2, { a: "b" }]);
  });

  it("preserves nested object output intact", () => {
    const obj = { a: { b: 2 } };
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
    };
    const nodeOutputs = { n1: obj };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, obj);
    assert.deepStrictEqual(result, { a: { b: 2 } });
  });

  it("preserves multiple active predecessor IDs correctly", () => {
    const edges: WorkflowEdge[] = [
      { source: "source-alpha", target: "dest" },
      { source: "source-beta", target: "dest" },
      { source: "source-gamma", target: "dest" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
      [getEdgeKey(edges[1])]: "active",
      [getEdgeKey(edges[2])]: "active",
    };
    const nodeOutputs = {
      "source-alpha": "alpha-val",
      "source-beta": "beta-val",
      "source-gamma": "gamma-val",
    };

    const result = resolveNodeInput("dest", edges, edgeStates, nodeOutputs);
    assert.deepStrictEqual(result, {
      "source-alpha": "alpha-val",
      "source-beta": "beta-val",
      "source-gamma": "gamma-val",
    });
  });

  it("freezes multi-input object so it cannot be mutated", () => {
    const edges: WorkflowEdge[] = [
      { source: "n1", target: "n3" },
      { source: "n2", target: "n3" },
    ];
    const edgeStates: Record<string, EdgeResolutionStatus> = {
      [getEdgeKey(edges[0])]: "active",
      [getEdgeKey(edges[1])]: "active",
    };
    const nodeOutputs = { n1: "val1", n2: "val2" };

    const result = resolveNodeInput("n3", edges, edgeStates, nodeOutputs) as Record<string, unknown>;
    assert.ok(Object.isFrozen(result));
    assert.throws(() => {
      "use strict";
      (result as Record<string, unknown>).n1 = "mutated";
    }, TypeError);
  });

  it("works seamlessly with Map instance for edgeStates", () => {
    const edges: WorkflowEdge[] = [{ source: "n1", target: "n2" }];
    const edgeStates = new Map<string, EdgeResolutionStatus>();
    edgeStates.set(getEdgeKey(edges[0]), "active");
    const nodeOutputs = { n1: "from-map" };

    const result = resolveNodeInput("n2", edges, edgeStates, nodeOutputs);
    assert.strictEqual(result, "from-map");
  });
});
