import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { createWebhookRoutes } from "../src/routes/webhook.routes.js";
import { TriggerRepository } from "../src/repositories/trigger.repository.js";
import { ExecutionService } from "../src/services/execution.service.js";
import type { TriggerRecord } from "../src/triggers/types.js";

describe("Phase 6: Inbound Webhook API Integration Tests", () => {
  let server: Server;
  let baseUrl: string;
  let receivedPayload: unknown = null;

  const mockTriggers = new Map<string, TriggerRecord>([
    [
      "active-hook",
      {
        id: "trig_hook_active",
        workflow_id: "wf_hook_test",
        type: "webhook",
        config: { path: "active-hook", secret: "secret123", enabled: true },
        enabled: true,
        last_triggered_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    [
      "disabled-hook",
      {
        id: "trig_hook_disabled",
        workflow_id: "wf_hook_test",
        type: "webhook",
        config: { path: "disabled-hook", enabled: false },
        enabled: false,
        last_triggered_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  ]);

  before(async () => {
    const mockTriggerRepo: any = {
      getTriggerByWebhookPath: async (path: string) => mockTriggers.get(path) || null,
      updateLastTriggeredAt: async () => {},
    };

    const mockExecService: any = {
      startRun: async (params: any) => {
        receivedPayload = params.triggerPayload;
        return {
          run: {
            id: "run_from_webhook",
            status: "succeeded",
          },
        };
      },
    };

    const app = express();
    app.use(express.json());
    app.use("/api/webhooks", createWebhookRoutes(mockTriggerRepo, mockExecService));

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}/api/webhooks`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns 404 when webhook path is not registered", async () => {
    const res = await fetch(`${baseUrl}/unknown-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error?.code, "WEBHOOK_NOT_FOUND");
  });

  it("returns 403 when webhook is disabled", async () => {
    const res = await fetch(`${baseUrl}/disabled-hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: 123 }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error?.code, "WEBHOOK_DISABLED");
  });

  it("returns 401 when webhook secret is missing or incorrect", async () => {
    const res = await fetch(`${baseUrl}/active-hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": "wrong-secret" },
      body: JSON.stringify({ data: 123 }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error?.code, "INVALID_WEBHOOK_SECRET");
  });

  it("returns 201 and triggers workflow run with payload when secret is valid", async () => {
    const payload = { customerId: "cust_99", amount: 450 };
    const res = await fetch(`${baseUrl}/active-hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": "secret123" },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data?.runId, "run_from_webhook");
    assert.deepEqual(receivedPayload, payload);
  });
});
