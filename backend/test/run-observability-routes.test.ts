import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";
import { getDatabasePool, closeDatabasePool } from "../src/config/database.js";
import { runMigrations } from "../src/migrations/runner.js";
import { WorkflowRepository } from "../src/repositories/workflow.repository.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 5.2: Run Observability & Event Trace Integration Tests", () => {
  const pool = getDatabasePool();
  const workflowRepo = new WorkflowRepository(pool);
  let server: Server;
  let baseUrl: string;

  const testWorkflow: Workflow = {
    id: "wf-obs-pipeline",
    name: "Observability Pipeline",
    nodes: [
      { id: "source", type: "static_value", config: { value: "hello observability" } },
      { id: "upper", type: "text_transform", config: { operation: "uppercase" } },
      { id: "cond", type: "condition_branch", config: { operator: "equals", compareValue: "HELLO OBSERVABILITY" } },
      { id: "trueBranch", type: "passthrough", config: {} },
      { id: "falseBranch", type: "passthrough", config: {} },
    ],
    edges: [
      { source: "source", target: "upper" },
      { source: "upper", target: "cond" },
      { source: "cond", target: "trueBranch", sourceHandle: "true" },
      { source: "cond", target: "falseBranch", sourceHandle: "false" },
    ],
  };

  before(async () => {
    await runMigrations(pool);
    await pool.query("DELETE FROM workflow_runs WHERE workflow_id = 'wf-obs-pipeline'");
    await pool.query("DELETE FROM workflows WHERE id = 'wf-obs-pipeline'");

    await workflowRepo.createWorkflow(
      "wf-obs-pipeline",
      "Observability Pipeline",
      "Tests observability & events",
      testWorkflow
    );

    const app = createServer();
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;
    baseUrl = `http://127.0.0.1:${port}/api/runs`;
  });

  after(async () => {
    server.close();
    await pool.query("DELETE FROM workflow_runs WHERE workflow_id = 'wf-obs-pipeline'");
    await pool.query("DELETE FROM workflows WHERE id = 'wf-obs-pipeline'");
    await closeDatabasePool();
  });

  it("triggers run and retrieves complete chronological event trace via GET /api/runs/:id", async () => {
    const startRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: "wf-obs-pipeline" }),
    });

    assert.strictEqual(startRes.status, 201);
    const startJson = await startRes.json();
    const runId = startJson.data.id;

    // Fetch full run detail including event trace
    const getRes = await fetch(`${baseUrl}/${runId}`);
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.success, true);
    assert.strictEqual(getJson.data.id, runId);
    assert.strictEqual(getJson.data.status, "succeeded");

    // Events trace assertion
    const events = getJson.data.events;
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 4, "Expected at least 4 node events");

    // Verify ordering is strictly ascending by eventOrder
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].eventOrder > events[i - 1].eventOrder, "Events must be strictly ordered by eventOrder");
    }

    // Verify falseBranch was recorded as skipped
    const skippedEvent = events.find((e: any) => e.nodeId === "falseBranch" && e.status === "skipped");
    assert.ok(skippedEvent, "falseBranch should be recorded as skipped");

    // Verify upper completed with transformed text
    const upperEvent = events.find((e: any) => e.nodeId === "upper" && e.status === "completed");
    assert.ok(upperEvent);
    assert.strictEqual(upperEvent.output, "HELLO OBSERVABILITY");

    // Verify trueBranch completed with condition output
    const trueBranchEvent = events.find((e: any) => e.nodeId === "trueBranch" && e.status === "completed");
    assert.ok(trueBranchEvent);
    assert.deepStrictEqual(trueBranchEvent.output, { evaluated: true, input: "HELLO OBSERVABILITY" });
  });

  it("lists runs with pagination and filtering via GET /api/runs", async () => {
    // Query with filter on workflowId
    const res = await fetch(`${baseUrl}?workflowId=wf-obs-pipeline&page=1&limit=10`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();

    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length >= 1);
    assert.strictEqual(json.pagination.page, 1);
    assert.strictEqual(json.pagination.limit, 10);
    assert.ok(json.pagination.total >= 1);
    assert.ok(json.pagination.totalPages >= 1);

    // Query with status filter
    const statusRes = await fetch(`${baseUrl}?status=succeeded`);
    assert.strictEqual(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.ok(statusJson.data.every((r: any) => r.status === "succeeded"));
  });

  it("clears runs and cascades events via DELETE /api/runs?workflowId=...", async () => {
    // Delete runs for specific workflowId
    const delRes = await fetch(`${baseUrl}?workflowId=wf-obs-pipeline`, {
      method: "DELETE",
    });
    assert.strictEqual(delRes.status, 200);
    const delJson = await delRes.json();
    assert.strictEqual(delJson.success, true);
    assert.ok(typeof delJson.data.deletedCount === "number");
    assert.ok(delJson.data.deletedCount >= 1);

    // Verify GET /api/runs returns 0 runs for that workflow
    const checkRes = await fetch(`${baseUrl}?workflowId=wf-obs-pipeline`);
    const checkJson = await checkRes.json();
    assert.strictEqual(checkJson.success, true);
    assert.strictEqual(checkJson.data.length, 0);

    // Verify MySQL events were cascade deleted
    const [eventRows] = await pool.query<any[]>(
      "SELECT COUNT(*) as count FROM workflow_run_events WHERE run_id NOT IN (SELECT id FROM workflow_runs)"
    );
    assert.strictEqual(Number(eventRows[0].count), 0, "No orphaned run events should exist");
  });
});
