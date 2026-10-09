import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mysql, { type Pool } from "mysql2/promise";
import { config } from "../src/config/env.js";
import { RunRepository } from "../src/repositories/run.repository.js";
import { RunEventRepository } from "../src/repositories/run-event.repository.js";
import { runMigrations } from "../src/migrations/runner.js";

describe("Phase 5.2: RunEventRepository MySQL Persistence Tests", () => {
  let pool: Pool;
  let runRepo: RunRepository;
  let eventRepo: RunEventRepository;
  const testRunId = `test_run_events_${Date.now()}`;

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
    runRepo = new RunRepository(pool);
    eventRepo = new RunEventRepository(pool);
    await runMigrations(pool);

    // Create parent run
    await runRepo.createRun({
      id: testRunId,
      workflowId: "wf-event-test",
      workflowVersion: 1,
      workflowSnapshot: { id: "wf-event-test", name: "Events Test", nodes: [], edges: [] },
    });
  });

  after(async () => {
    await pool.query("DELETE FROM workflow_runs WHERE id = ?", [testRunId]);
    await pool.end();
  });

  it("persists run events with redaction and retrieves them in deterministic order", async () => {
    // Insert event 2 first, then event 1, then event 3
    await eventRepo.createEvent({
      id: `evt_${testRunId}_2`,
      runId: testRunId,
      nodeId: "node_b",
      nodeType: "text_transform",
      status: "completed",
      input: { text: "hello", apiKey: "secret_123" },
      output: "HELLO",
      eventOrder: 2,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 15,
    });

    await eventRepo.createEvent({
      id: `evt_${testRunId}_1`,
      runId: testRunId,
      nodeId: "node_a",
      nodeType: "static_value",
      status: "completed",
      input: null,
      output: { value: "hello", password: "mypassword" },
      eventOrder: 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 5,
    });

    await eventRepo.createEvent({
      id: `evt_${testRunId}_3`,
      runId: testRunId,
      nodeId: "node_c",
      nodeType: "passthrough",
      status: "skipped",
      eventOrder: 3,
    });

    const events = await eventRepo.listEventsByRunId(testRunId);
    assert.strictEqual(events.length, 3);

    // Verify ordering
    assert.strictEqual(events[0].node_id, "node_a");
    assert.strictEqual(events[0].event_order, 1);
    assert.strictEqual(events[1].node_id, "node_b");
    assert.strictEqual(events[1].event_order, 2);
    assert.strictEqual(events[2].node_id, "node_c");
    assert.strictEqual(events[2].event_order, 3);
    assert.strictEqual(events[2].status, "skipped");

    // Verify redaction was applied
    const nodeAOutput = events[0].output as Record<string, unknown>;
    assert.strictEqual(nodeAOutput.password, "[REDACTED]");
    assert.strictEqual(nodeAOutput.value, "hello");

    const nodeBInput = events[1].input as Record<string, unknown>;
    assert.strictEqual(nodeBInput.apiKey, "[REDACTED]");
    assert.strictEqual(nodeBInput.text, "hello");
  });
});
