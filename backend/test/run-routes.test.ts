import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import { getDatabasePool, closeDatabasePool } from "../src/config/database.js";
import { runMigrations } from "../src/migrations/runner.js";
import { WorkflowRepository } from "../src/repositories/workflow.repository.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 5.1: Run Routes End-to-End API Integration Tests", () => {
  const pool = getDatabasePool();
  const workflowRepo = new WorkflowRepository(pool);
  let server: Server;
  let baseUrl: string;

  const validWorkflowGraph: Workflow = {
    id: "wf-api-test-valid",
    name: "Valid Run API Test Pipeline",
    nodes: [
      { id: "source", type: "static_value", config: { value: "hello from test" } },
      { id: "upper", type: "text_transform", config: { operation: "uppercase" } },
    ],
    edges: [{ source: "source", target: "upper" }],
  };

  const invalidDagWorkflowGraph: Workflow = {
    id: "wf-api-test-cyclic",
    name: "Cyclic Test Pipeline",
    nodes: [
      { id: "A", type: "passthrough", config: {} },
      { id: "B", type: "passthrough", config: {} },
    ],
    edges: [
      { source: "A", target: "B" },
      { source: "B", target: "A" },
    ],
  };

  before(async () => {
    await runMigrations(pool);

    // Seed workflows in database
    await pool.query("DELETE FROM workflow_runs WHERE workflow_id LIKE 'wf-api-test-%'");
    await pool.query("DELETE FROM workflows WHERE id LIKE 'wf-api-test-%'");

    await workflowRepo.createWorkflow(
      "wf-api-test-valid",
      "Valid Run API Test Pipeline",
      "Test description",
      validWorkflowGraph
    );

    await workflowRepo.createWorkflow(
      "wf-api-test-cyclic",
      "Cyclic Test Pipeline",
      null,
      invalidDagWorkflowGraph
    );

    const app = createServer();
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;
    baseUrl = `http://127.0.0.1:${port}/api/runs`;
  });

  after(async () => {
    server.close();
    await pool.query("DELETE FROM workflow_runs WHERE workflow_id LIKE 'wf-api-test-%'");
    await pool.query("DELETE FROM workflows WHERE id LIKE 'wf-api-test-%'");
    await closeDatabasePool();
  });

  it("POST /api/runs returns 400 when workflowId is missing", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, "VALIDATION_ERROR");
  });

  it("POST /api/runs returns 404 when workflow does not exist", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: "nonexistent-wf" }),
    });

    assert.strictEqual(res.status, 404);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, "WORKFLOW_NOT_FOUND");
  });

  it("POST /api/runs returns 400 when workflow DAG is invalid", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: "wf-api-test-cyclic" }),
    });

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, "INVALID_WORKFLOW");
  });

  it("POST /api/runs successfully starts run, executes valid workflow, and returns 201", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId: "wf-api-test-valid",
        idempotencyKey: "unique-key-run-1",
      }),
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.id);
    assert.strictEqual(json.data.workflowId, "wf-api-test-valid");
    assert.strictEqual(json.data.status, "succeeded");
    assert.strictEqual(json.data.idempotencyKey, "unique-key-run-1");
    assert.ok(json.data.startedAt);
    assert.ok(json.data.finishedAt);
    assert.strictEqual(json.data.error, null);

    // Verify GET /api/runs/:id returns the same run
    const getRes = await fetch(`${baseUrl}/${json.data.id}`);
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.success, true);
    assert.strictEqual(getJson.data.id, json.data.id);
    assert.strictEqual(getJson.data.status, "succeeded");
  });

  it("POST /api/runs returns 200 with Idempotent-Replay header when using duplicate idempotencyKey", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId: "wf-api-test-valid",
        idempotencyKey: "unique-key-run-1", // duplicate key
      }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("idempotent-replay"), "true");
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.idempotencyKey, "unique-key-run-1");
  });

  it("GET /api/runs/:id returns 404 for non-existent run ID", async () => {
    const res = await fetch(`${baseUrl}/run_nonexistent_12345`);
    assert.strictEqual(res.status, 404);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, "NOT_FOUND");
  });
});
