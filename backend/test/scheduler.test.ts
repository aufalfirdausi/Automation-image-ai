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

  describe("Daily WIB Slot Evaluation & Catch-up", () => {
    it("does not trigger before target slot time on current day", () => {
      const scheduler = new SchedulerService({} as any, {} as any);
      // 09:30 WIB = 02:30 UTC
      const now = new Date("2026-10-12T02:30:00.000Z");

      const trigger: TriggerRecord = {
        id: "trig_daily_1",
        workflow_id: "wf_wave1",
        type: "schedule",
        config: { type: "daily", time: "10:00", catchUp: true },
        enabled: true,
        last_triggered_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      assert.equal(scheduler.shouldTrigger(trigger, now), false);
    });

    it("triggers on or after target slot time when never run before (catch-up on boot)", () => {
      const scheduler = new SchedulerService({} as any, {} as any);
      // 10:15 WIB = 03:15 UTC (booted after 10:00 WIB slot)
      const now = new Date("2026-10-12T03:15:00.000Z");

      const trigger: TriggerRecord = {
        id: "trig_daily_1",
        workflow_id: "wf_wave1",
        type: "schedule",
        config: { type: "daily", time: "10:00", catchUp: true },
        enabled: true,
        last_triggered_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      assert.equal(scheduler.shouldTrigger(trigger, now), true);
    });

    it("does not re-trigger on same calendar day if already executed after slot time", () => {
      const scheduler = new SchedulerService({} as any, {} as any);
      // 11:00 WIB = 04:00 UTC
      const now = new Date("2026-10-12T04:00:00.000Z");
      // Ran at 10:01 WIB = 03:01 UTC
      const lastRun = new Date("2026-10-12T03:01:00.000Z").toISOString();

      const trigger: TriggerRecord = {
        id: "trig_daily_1",
        workflow_id: "wf_wave1",
        type: "schedule",
        config: { type: "daily", time: "10:00", catchUp: true },
        enabled: true,
        last_triggered_at: lastRun,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      assert.equal(scheduler.shouldTrigger(trigger, now), false);
    });

    it("triggers on next calendar day when last run was yesterday", () => {
      const scheduler = new SchedulerService({} as any, {} as any);
      // 10:05 WIB on Oct 13 = 03:05 UTC
      const now = new Date("2026-10-13T03:05:00.000Z");
      // Ran yesterday Oct 12 at 10:00 WIB
      const lastRun = new Date("2026-10-12T03:00:00.000Z").toISOString();

      const trigger: TriggerRecord = {
        id: "trig_daily_1",
        workflow_id: "wf_wave1",
        type: "schedule",
        config: { type: "daily", time: "10:00", catchUp: true },
        enabled: true,
        last_triggered_at: lastRun,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      assert.equal(scheduler.shouldTrigger(trigger, now), true);
    });

    it("fires daily schedule with deterministic date-stamped idempotency key", async () => {
      let passedParams: any = null;
      const mockTriggerRepo: any = {
        updateLastTriggeredAt: async () => {},
      };
      const mockExecService: any = {
        startRun: async (p: any) => {
          passedParams = p;
          return { run: { id: "run_daily", status: "succeeded" } };
        },
      };

      const scheduler = new SchedulerService(mockTriggerRepo, mockExecService);
      // 10:00 WIB on 2026-10-12 = 03:00 UTC
      const now = new Date("2026-10-12T03:00:00.000Z");
      const trigger: TriggerRecord = {
        id: "trig_daily_slot",
        workflow_id: "wf_wave1",
        type: "schedule",
        config: { type: "daily", time: "10:00" },
        enabled: true,
        last_triggered_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      await scheduler.fireSchedule(trigger, now);

      assert.equal(passedParams.workflowId, "wf_wave1");
      assert.equal(passedParams.triggerType, "schedule");
      assert.equal(passedParams.idempotencyKey, "wf_wave1_daily_20261012_1000");
    });
  });
});
