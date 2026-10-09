import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidRunTransition,
  assertRunTransition,
  isTerminalRunStatus,
  InvalidRunStatusTransitionError,
} from "../src/runs/state-machine.js";
import type { RunStatus } from "../src/runs/types.js";

describe("Phase 5.1: Run State Machine & Transitions", () => {
  it("allows valid transitions through the run lifecycle", () => {
    // requested -> running
    assert.strictEqual(isValidRunTransition("requested", "running"), true);
    assert.doesNotThrow(() => assertRunTransition("requested", "running"));

    // requested -> failed (pre-execution failure)
    assert.strictEqual(isValidRunTransition("requested", "failed"), true);
    assert.doesNotThrow(() => assertRunTransition("requested", "failed"));

    // running -> succeeded
    assert.strictEqual(isValidRunTransition("running", "succeeded"), true);
    assert.doesNotThrow(() => assertRunTransition("running", "succeeded"));

    // running -> failed
    assert.strictEqual(isValidRunTransition("running", "failed"), true);
    assert.doesNotThrow(() => assertRunTransition("running", "failed"));

    // running -> cancelled
    assert.strictEqual(isValidRunTransition("running", "cancelled"), true);
    assert.doesNotThrow(() => assertRunTransition("running", "cancelled"));
  });

  it("strictly rejects forbidden status transitions with InvalidRunStatusTransitionError", () => {
    // requested cannot jump directly to succeeded or cancelled
    assert.strictEqual(isValidRunTransition("requested", "succeeded"), false);
    assert.throws(
      () => assertRunTransition("requested", "succeeded"),
      (err: unknown) =>
        err instanceof InvalidRunStatusTransitionError &&
        err.code === "INVALID_STATUS_TRANSITION" &&
        err.fromStatus === "requested" &&
        err.toStatus === "succeeded"
    );

    assert.strictEqual(isValidRunTransition("requested", "cancelled"), false);
    assert.throws(() => assertRunTransition("requested", "cancelled"), InvalidRunStatusTransitionError);

    // Terminal states cannot transition to anything
    const terminalStates: RunStatus[] = ["succeeded", "failed", "cancelled"];
    const allStates: RunStatus[] = ["requested", "running", "succeeded", "failed", "cancelled"];

    for (const term of terminalStates) {
      for (const target of allStates) {
        assert.strictEqual(isValidRunTransition(term, target), false);
        assert.throws(
          () => assertRunTransition(term, target),
          InvalidRunStatusTransitionError,
          `Expected transition from ${term} to ${target} to be rejected`
        );
      }
    }
  });

  it("correctly identifies terminal run states", () => {
    assert.strictEqual(isTerminalRunStatus("requested"), false);
    assert.strictEqual(isTerminalRunStatus("running"), false);
    assert.strictEqual(isTerminalRunStatus("succeeded"), true);
    assert.strictEqual(isTerminalRunStatus("failed"), true);
    assert.strictEqual(isTerminalRunStatus("cancelled"), true);
  });
});
