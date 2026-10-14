export type TriggerType = "schedule" | "webhook";

export type ScheduleType = "interval" | "daily";

export interface ScheduleConfig {
  type?: ScheduleType;
  intervalMs?: number;
  cronExpression?: string;
  time?: string;
  timezone?: string;
  catchUp?: boolean;
  enabled?: boolean;
}

export interface WebhookConfig {
  path: string;
  secret?: string;
  enabled?: boolean;
}

export type TriggerConfig = ScheduleConfig | WebhookConfig;

export interface TriggerRecord {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: TriggerConfig;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTriggerParams {
  id?: string;
  workflowId: string;
  type: TriggerType;
  config: TriggerConfig;
  enabled?: boolean;
}

export interface TriggerDto {
  id: string;
  workflowId: string;
  type: TriggerType;
  config: TriggerConfig;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
