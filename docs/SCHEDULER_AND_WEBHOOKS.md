# Scheduler and Inbound Webhooks Specification (Phase 6)

## 1. Architectural Scope & Boundary

- **Local Execution**: Both the scheduler and inbound webhook handler run within the existing Node.js/TypeScript backend service.
- **No External Infrastructure Required**: No Redis, message brokers, distributed workers, or external cron daemons.
- **Single Source of Truth**: All trigger records, configurations, and invocation timestamps are persisted to MySQL in the `triggers` table.

---

## 2. Trigger Model & Storage

Table: `triggers` (migration `004_create_triggers_table.sql`)
- `id`: Unique identifier (e.g. `trig_...`).
- `workflow_id`: Target workflow to execute.
- `type`: `'schedule'` or `'webhook'`.
- `config`: JSON payload containing trigger-specific settings.
  - Schedule: `{ intervalMs: number, enabled: boolean }`.
  - Webhook: `{ path: string, secret?: string, enabled: boolean }`.
- `enabled`: Boolean active flag.
- `last_triggered_at`: Timestamp of the most recent execution trigger.

---

## 3. Scheduler Engine (`backend/src/scheduler/`)

- Operates via `SchedulerService.tick()`.
- On each tick:
  1. Queries all active schedule triggers (`enabled = true`).
  2. Compares `now - last_triggered_at >= intervalMs`.
  3. Updates `last_triggered_at` and triggers `ExecutionService.startRun({ triggerType: "schedule" })`.
- Handles graceful start and stop during server lifecycle.

---

## 4. Inbound Webhook Endpoint (`backend/src/routes/webhook.routes.ts`)

- Endpoint: `POST /api/webhooks/:path`
- Security Gates:
  1. **Path Resolution**: Verifies webhook path exists in `triggers` table (HTTP 404 if missing).
  2. **Enabled Check**: Verifies webhook is enabled (HTTP 403 if disabled).
  3. **Secret Verification**: If `secret` is configured, verifies `X-Webhook-Secret` header or `?secret=` query parameter (HTTP 401 if invalid or absent).
  4. **Execution Dispatch**: Ingests request payload and passes it via `triggerPayload` into the execution context.
  5. **Response**: Returns HTTP 201 Created with `{ success: true, data: { runId, status } }`.
