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

    if (config.type === "daily") {
      return this.shouldTriggerDaily(trigger, config, now);
    }

    const intervalMs = config.intervalMs || 60000; // default 60s
    if (!trigger.last_triggered_at) {
      return true;
    }
    const lastRunTime = new Date(trigger.last_triggered_at).getTime();
    return now.getTime() - lastRunTime >= intervalMs;
  }

  private shouldTriggerDaily(
    trigger: TriggerRecord,
    config: ScheduleConfig,
    now: Date
  ): boolean {
    const timeStr = config.time || "10:00";
    const [targetHour, targetMinute] = timeStr.split(":").map((v) => parseInt(v, 10));
    if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) return false;

    // WIB is UTC+7 fixed offset (420 minutes)
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWib = new Date(now.getTime() + WIB_OFFSET_MS);

    const year = nowWib.getUTCFullYear();
    const month = nowWib.getUTCMonth();
    const day = nowWib.getUTCDate();

    // Target slot instant today in UTC millis
    const slotWibUtcMs = Date.UTC(year, month, day, targetHour, targetMinute, 0, 0) - WIB_OFFSET_MS;
    const nowMs = now.getTime();

    // Not yet reached target slot today
    if (nowMs < slotWibUtcMs) {
      return false;
    }

    // Never triggered: catchUp defaults to true
    const catchUp = config.catchUp !== false;
    if (!trigger.last_triggered_at) {
      return catchUp;
    }

    const lastTriggeredMs = new Date(trigger.last_triggered_at).getTime();
    // Guard: only fire if last run was strictly before today's target slot
    return lastTriggeredMs < slotWibUtcMs;
  }

  async fireSchedule(trigger: TriggerRecord, now: Date): Promise<void> {
    const config = trigger.config as ScheduleConfig;
    let idempotencyKey: string | undefined;

    if (config.type === "daily") {
      const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
      const nowWib = new Date(now.getTime() + WIB_OFFSET_MS);
      const y = nowWib.getUTCFullYear();
      const m = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
      const d = String(nowWib.getUTCDate()).padStart(2, "0");
      const slotTime = (config.time || "10:00").replace(":", "");
      idempotencyKey = `${trigger.workflow_id}_daily_${y}${m}${d}_${slotTime}`;
    }

    try {
      await this.triggerRepo.updateLastTriggeredAt(trigger.id, now);
      await this.executionService.startRun({
        workflowId: trigger.workflow_id,
        triggerType: "schedule",
        idempotencyKey,
      });
    } catch (err) {
      console.error(
        `[SchedulerService] Failed to execute scheduled run for workflow '${trigger.workflow_id}':`,
        err
      );
    }
  }
}
