import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDatabasePool, closeDatabasePool } from "../src/config/database.js";
import { runMigrations } from "../src/migrations/runner.js";
import { WorkflowRepository } from "../src/repositories/workflow.repository.js";
import { TriggerRepository } from "../src/repositories/trigger.repository.js";

describe("Phase 6: TriggerRepository MySQL Persistence Tests", () => {
  let triggerRepo: TriggerRepository;
  let workflowRepo: WorkflowRepository;
  const testWfId = "wf_trigger_repo_test";

  before(async () => {
    await runMigrations();
    triggerRepo = new TriggerRepository();
    workflowRepo = new WorkflowRepository();

    await workflowRepo.createWorkflow(
      testWfId,
      "Trigger Repo Test WF",
      null,
      {
        id: testWfId,
        name: "Trigger Repo Test WF",
        nodes: [{ id: "n1", type: "passthrough", config: {} }],
        edges: [],
      }
    );
  });

  after(async () => {
    const pool = getDatabasePool();
    await pool.execute("DELETE FROM workflows WHERE id = ?", [testWfId]);
    await closeDatabasePool();
  });

  it("creates, retrieves, and filters schedule and webhook triggers", async () => {
    const scheduleTrigger = await triggerRepo.createTrigger({
      id: "trig_sched_1",
      workflowId: testWfId,
      type: "schedule",
      config: { intervalMs: 5000 },
      enabled: true,
    });

    assert.equal(scheduleTrigger.id, "trig_sched_1");
    assert.equal(scheduleTrigger.type, "schedule");
    assert.equal(scheduleTrigger.enabled, true);
    assert.equal((scheduleTrigger.config as any).intervalMs, 5000);

    const webhookTrigger = await triggerRepo.createTrigger({
      id: "trig_hook_1",
      workflowId: testWfId,
      type: "webhook",
      config: { path: "test-inbound-hook", secret: "super-secret" },
      enabled: true,
    });

    assert.equal(webhookTrigger.id, "trig_hook_1");
    assert.equal(webhookTrigger.type, "webhook");

    // Lookup by webhook path
    const foundByPath = await triggerRepo.getTriggerByWebhookPath("test-inbound-hook");
    assert.ok(foundByPath);
    assert.equal(foundByPath.id, "trig_hook_1");

    // Filter by type
    const schedules = await triggerRepo.listTriggers({ workflowId: testWfId, type: "schedule" });
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].id, "trig_sched_1");

    // Update trigger
    const updated = await triggerRepo.updateTrigger("trig_sched_1", { enabled: false });
    assert.equal(updated?.enabled, false);

    // Delete trigger
    const deleted = await triggerRepo.deleteTrigger("trig_sched_1");
    assert.equal(deleted, true);

    const deletedLookup = await triggerRepo.getTriggerById("trig_sched_1");
    assert.equal(deletedLookup, null);
  });
});
