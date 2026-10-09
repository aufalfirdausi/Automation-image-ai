import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SchedulerService } from "../src/scheduler/scheduler.service.js";
import { TriggerRepository } from "../src/repositories/trigger.repository.js";
import type { TriggerRecord } from "../src/triggers/types.js";

describe("Phase 6: SchedulerService Evaluation & Execution", () => {
  it("evaluates interval triggers correctly based on last_triggered_at and intervalMs", () => {
    const scheduler = new SchedulerService({} as any, {} as any);
    const now = new Date("2026-09-30T12:00:00.000Z");

    const newTrigger: TriggerRecord = {
      id: "trig_new",
      workflow_id: "wf_1",
      type: "schedule",
      config: { intervalMs: 10000 },
      enabled: true,
      last_triggered_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    // If never triggered, should trigger immediately
    assert.equal(scheduler.shouldTrigger(newTrigger, now), true);

    const recentlyTriggered: TriggerRecord = {
      ...newTrigger,
      last_triggered_at: new Date("2026-09-30T11:59:55.000Z").toISOString(), // 5 seconds ago
    };
    // 5 seconds elapsed < 10 seconds interval -> should not trigger
    assert.equal(scheduler.shouldTrigger(recentlyTriggered, now), false);

    const dueTrigger: TriggerRecord = {
      ...newTrigger,
      last_triggered_at: new Date("2026-09-30T11:59:45.000Z").toISOString(), // 15 seconds ago
    };
    // 15 seconds elapsed >= 10 seconds interval -> should trigger
    assert.equal(scheduler.shouldTrigger(dueTrigger, now), true);
  });

  it("fires scheduled workflow execution and updates last_triggered_at on tick", async () => {
    let triggeredWorkflowId: string | null = null;
    let updatedTriggerId: string | null = null;

    const mockTriggerRepo: any = {
      listTriggers: async () => [
        {
          id: "trig_due",
          workflow_id: "wf_due_1",
          type: "schedule",
          config: { intervalMs: 5000 },
          enabled: true,
          last_triggered_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      updateLastTriggeredAt: async (id: string) => {
        updatedTriggerId = id;
      },
    };

    const mockExecService: any = {
      startRun: async (params: any) => {
        triggeredWorkflowId = params.workflowId;
        return { run: { id: "run_sched_test", status: "succeeded" } };
      },
    };

    const scheduler = new SchedulerService(mockTriggerRepo, mockExecService);
    const firedCount = await scheduler.tick();

    assert.equal(firedCount, 1);
    assert.equal(updatedTriggerId, "trig_due");
    assert.equal(triggeredWorkflowId, "wf_due_1");
  });
});
