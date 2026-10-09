import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import type { Server } from "node:http";
import type { Workflow } from "../src/engine/types.js";
import { closeDatabasePool } from "../src/config/database.js";

describe("Sub-Phase 3.3: Workflow Routes Integration Tests", () => {
  after(async () => {
    await closeDatabasePool();
  });
  it("POST /api/workflows/validate returns isValid: true for a valid DAG", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const validWorkflow: Workflow = {
        id: "wf-1",
        name: "Valid Pipeline",
        nodes: [
          { id: "A", type: "trigger", config: {} },
          { id: "B", type: "action", config: {} },
        ],
        edges: [{ source: "A", target: "B" }],
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/workflows/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validWorkflow),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isValid, true);
      assert.deepStrictEqual(json.data.errors, []);
    } finally {
      server.close();
    }
  });

  it("POST /api/workflows/validate detects cycles and reports structured errors", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const cyclicWorkflow: Workflow = {
        id: "wf-cycle",
        name: "Cycle Pipeline",
        nodes: [
          { id: "A", type: "trigger", config: {} },
          { id: "B", type: "action", config: {} },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "B", target: "A" },
        ],
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/workflows/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cyclicWorkflow),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isValid, false);
      assert.ok(json.data.errors.length > 0);
      assert.ok(json.data.errors[0].message.includes("Cyclic dependency detected"));
    } finally {
      server.close();
    }
  });

  it("DELETE /api/workflows/:id returns 404 for non-existent workflow", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/workflows/non-existent-wf-${Date.now()}`, {
        method: "DELETE",
      });

      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });

  it("DELETE /api/workflows/:id successfully deletes workflow, cascades triggers, and preserves historical runs and events", async () => {
    const { getDatabasePool } = await import("../src/config/database.js");
    const { runMigrations } = await import("../src/migrations/runner.js");
    const { WorkflowRepository } = await import("../src/repositories/workflow.repository.js");
    const { TriggerRepository } = await import("../src/repositories/trigger.repository.js");
    const { RunRepository } = await import("../src/repositories/run.repository.js");
    const { RunEventRepository } = await import("../src/repositories/run-event.repository.js");

    const pool = getDatabasePool();
    await runMigrations(pool);

    const workflowRepo = new WorkflowRepository(pool);
    const triggerRepo = new TriggerRepository(pool);
    const runRepo = new RunRepository(pool);
    const runEventRepo = new RunEventRepository(pool);

    const testWfId = "wf-delete-int-test";
    const testRunId = "run-delete-int-test";
    const testEventId = "evt-delete-int-test";
    const testTriggerId = "trig-delete-int-test";

    // Clean up residual test data
    await pool.query("DELETE FROM workflow_runs WHERE id = ?", [testRunId]);
    await pool.query("DELETE FROM workflows WHERE id = ?", [testWfId]);

    // 1. Seed workflow
    const testGraph: Workflow = {
      id: testWfId,
      name: "Deletable Workflow",
      nodes: [{ id: "n1", type: "passthrough", config: {} }],
      edges: [],
    };
    await workflowRepo.createWorkflow(testWfId, "Deletable Workflow", null, testGraph);

    // 2. Seed associated trigger (fk_triggers_workflow ON DELETE CASCADE)
    await triggerRepo.createTrigger({
      id: testTriggerId,
      workflowId: testWfId,
      type: "schedule",
      config: { intervalMs: 60000 },
      enabled: true,
    });

    // 3. Seed historical workflow run and event
    await runRepo.createRun({
      id: testRunId,
      workflowId: testWfId,
      workflowVersion: 1,
      workflowSnapshot: testGraph,
    });
    await runEventRepo.createEvent({
      id: testEventId,
      runId: testRunId,
      nodeId: "n1",
      nodeType: "passthrough",
      status: "completed",
      eventOrder: 1,
    });

    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      // 4. Delete the workflow via API
      const res = await fetch(`http://127.0.0.1:${port}/api/workflows/${testWfId}`, {
        method: "DELETE",
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.message, "Workflow deleted successfully");

      // 5. Verify workflow is deleted
      const foundWf = await workflowRepo.getWorkflowById(testWfId);
      assert.strictEqual(foundWf, null);

      // 6. Verify triggers were automatically cascade-deleted
      const foundTrigger = await triggerRepo.getTriggerById(testTriggerId);
      assert.strictEqual(foundTrigger, null);

      // 7. Verify historical runs and run events are preserved
      const foundRun = await runRepo.getRunById(testRunId);
      assert.notStrictEqual(foundRun, null);
      assert.strictEqual(foundRun?.workflow_id, testWfId);

      const foundEvents = await runEventRepo.listEventsByRunId(testRunId);
      assert.strictEqual(foundEvents.length, 1);
      assert.strictEqual(foundEvents[0].id, testEventId);
    } finally {
      server.close();
      // Clean up test run and events
      await pool.query("DELETE FROM workflow_runs WHERE id = ?", [testRunId]);
    }
  });
});

