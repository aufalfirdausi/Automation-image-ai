import { TriggerRepository } from "../repositories/trigger.repository.js";
import { ExecutionService } from "../services/execution.service.js";
import type { ScheduleConfig, TriggerRecord } from "../triggers/types.js";

export class SchedulerService {
  private triggerRepo: TriggerRepository;
  private executionService: ExecutionService;
  private intervalTimer: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private running = false;
  private isTickBusy = false;

  constructor(
    triggerRepo?: TriggerRepository,
    executionService?: ExecutionService,
    checkIntervalMs = 1000
  ) {
    this.triggerRepo = triggerRepo || new TriggerRepository();
    this.executionService = executionService || new ExecutionService();
    this.checkIntervalMs = checkIntervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalTimer = setInterval(() => {
      void this.tick();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Evaluates all active schedules on each tick.
   */
  async tick(now = new Date()): Promise<number> {
    if (this.isTickBusy) return 0;
    this.isTickBusy = true;
    let firedCount = 0;

    try {
      const activeSchedules = await this.triggerRepo.listTriggers({
        type: "schedule",
        enabled: true,
      });

      for (const trigger of activeSchedules) {
        if (this.shouldTrigger(trigger, now)) {
          firedCount++;
          await this.fireSchedule(trigger, now);
        }
      }
    } catch (err) {
      console.error("[SchedulerService] Error evaluating schedules:", err);
    } finally {
      this.isTickBusy = false;
    }

    return firedCount;
  }

  shouldTrigger(trigger: TriggerRecord, now: Date): boolean {
    const config = trigger.config as ScheduleConfig;
    const intervalMs = config.intervalMs || 60000; // default 60s

    if (!trigger.last_triggered_at) {
      return true;
    }

    const lastRunTime = new Date(trigger.last_triggered_at).getTime();
    return now.getTime() - lastRunTime >= intervalMs;
  }

  async fireSchedule(trigger: TriggerRecord, now: Date): Promise<void> {
    try {
      await this.triggerRepo.updateLastTriggeredAt(trigger.id, now);
      await this.executionService.startRun({
        workflowId: trigger.workflow_id,
        triggerType: "schedule",
      });
    } catch (err) {
      console.error(
        `[SchedulerService] Failed to execute scheduled run for workflow '${trigger.workflow_id}':`,
        err
      );
    }
  }
}
