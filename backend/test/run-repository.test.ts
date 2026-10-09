import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mysql, { type Pool } from "mysql2/promise";
import { config } from "../src/config/env.js";
import { RunRepository } from "../src/repositories/run.repository.js";
import { runMigrations } from "../src/migrations/runner.js";
import type { Workflow } from "../src/engine/types.js";
import { InvalidRunStatusTransitionError } from "../src/runs/state-machine.js";

describe("Phase 5.1: RunRepository MySQL Persistence Tests", () => {
  let pool: Pool;
  let repo: RunRepository;
  const testRunIds: string[] = [];

  const sampleSnapshot: Workflow = {
    id: "wf-repo-test",
    name: "Repo Test Workflow",
    nodes: [
      { id: "node1", type: "static_value", config: { value: "test-data" } },
    ],
    edges: [],
  };

  before(async () => {
    pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      waitForConnections: true,
      connectionLimit: 2,
    });
    repo = new RunRepository(pool);
    await runMigrations(pool);
  });

  after(async () => {
    for (const runId of testRunIds) {
      await pool.query("DELETE FROM workflow_runs WHERE id = ?", [runId]);
    }
    await pool.end();
  });

  it("creates a new run record with requested status and snapshot", async () => {
    const runId = `test_run_${Date.now()}_1`;
    testRunIds.push(runId);

    const created = await repo.createRun({
      id: runId,
      workflowId: "wf-repo-test",
      workflowVersion: 1,
      workflowSnapshot: sampleSnapshot,
      triggerType: "manual",
      idempotencyKey: "test-idem-key-1",
    });

    assert.strictEqual(created.id, runId);
    assert.strictEqual(created.workflow_id, "wf-repo-test");
    assert.strictEqual(created.workflow_version, 1);
    assert.strictEqual(created.status, "requested");
    assert.strictEqual(created.trigger_type, "manual");
    assert.strictEqual(created.idempotency_key, "test-idem-key-1");
    assert.deepStrictEqual(created.workflow_snapshot, sampleSnapshot);
    assert.strictEqual(created.error, null);
    assert.ok(created.created_at);
  });

  it("fetches run by ID and idempotency key", async () => {
    const runId = `test_run_${Date.now()}_2`;
    testRunIds.push(runId);

    await repo.createRun({
      id: runId,
      workflowId: "wf-repo-test",
      workflowVersion: 1,
      workflowSnapshot: sampleSnapshot,
      idempotencyKey: "idem-lookup-key",
    });

    const byId = await repo.getRunById(runId);
    assert.ok(byId);
    assert.strictEqual(byId.id, runId);

    const byKey = await repo.getRunByIdempotencyKey("wf-repo-test", "idem-lookup-key");
    assert.ok(byKey);
    assert.strictEqual(byKey.id, runId);
  });

  it("updates status following valid state machine lifecycle", async () => {
    const runId = `test_run_${Date.now()}_3`;
    testRunIds.push(runId);

    await repo.createRun({
      id: runId,
      workflowId: "wf-repo-test",
      workflowVersion: 1,
      workflowSnapshot: sampleSnapshot,
    });

    // 1. Transition: requested -> running
    const startedAt = new Date().toISOString();
    const running = await repo.updateStatus(runId, "running", { startedAt });
    assert.strictEqual(running.status, "running");
    assert.ok(running.started_at);

    // 2. Transition: running -> succeeded
    const finishedAt = new Date().toISOString();
    const succeeded = await repo.updateStatus(runId, "succeeded", { finishedAt });
    assert.strictEqual(succeeded.status, "succeeded");
    assert.ok(succeeded.finished_at);

    // 3. Prohibited transition from terminal state throws InvalidRunStatusTransitionError
    await assert.rejects(
      () => repo.updateStatus(runId, "running"),
      (err: unknown) =>
        err instanceof InvalidRunStatusTransitionError &&
        err.code === "INVALID_STATUS_TRANSITION"
    );
  });

  it("persists root execution error when transitioning to failed", async () => {
    const runId = `test_run_${Date.now()}_4`;
    testRunIds.push(runId);

    await repo.createRun({
      id: runId,
      workflowId: "wf-repo-test",
      workflowVersion: 1,
      workflowSnapshot: sampleSnapshot,
    });

    await repo.updateStatus(runId, "running", { startedAt: new Date().toISOString() });

    const rootError = {
      code: "NODE_EXECUTION_FAILED",
      message: "Node 'node1' execution timed out",
      details: { timeoutMs: 5000 },
    };

    const failed = await repo.updateStatus(runId, "failed", {
      finishedAt: new Date().toISOString(),
      error: rootError,
    });

    assert.strictEqual(failed.status, "failed");
    assert.deepStrictEqual(failed.error, rootError);
  });
});
