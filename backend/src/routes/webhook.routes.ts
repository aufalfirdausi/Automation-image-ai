import { Router, type Request, type Response } from "express";
import { TriggerRepository } from "../repositories/trigger.repository.js";
import { ExecutionService } from "../services/execution.service.js";
import type { WebhookConfig } from "../triggers/types.js";

export function createWebhookRoutes(
  triggerRepo = new TriggerRepository(),
  executionService = new ExecutionService()
): Router {
  const router = Router();

  router.post("/:path", async (req: Request, res: Response) => {
    try {
      const pathParam = req.params.path;
      const trigger = await triggerRepo.getTriggerByWebhookPath(pathParam);

      if (!trigger) {
        res.status(404).json({
          success: false,
          error: {
            code: "WEBHOOK_NOT_FOUND",
            message: `No webhook configured for path '${pathParam}'`,
          },
        });
        return;
      }

      if (!trigger.enabled) {
        res.status(403).json({
          success: false,
          error: {
            code: "WEBHOOK_DISABLED",
            message: `Webhook '${pathParam}' is currently disabled`,
          },
        });
        return;
      }

      const config = trigger.config as WebhookConfig;
      if (config.secret && config.secret.trim().length > 0) {
        const headerSecret = req.headers["x-webhook-secret"];
        const querySecret = req.query.secret;
        const providedSecret = headerSecret || querySecret;

        if (providedSecret !== config.secret) {
          res.status(401).json({
            success: false,
            error: {
              code: "INVALID_WEBHOOK_SECRET",
              message: "Invalid or missing webhook secret authentication",
            },
          });
          return;
        }
      }

      await triggerRepo.updateLastTriggeredAt(trigger.id, new Date());

      const result = await executionService.startRun({
        workflowId: trigger.workflow_id,
        triggerType: "webhook",
        triggerPayload: req.body,
      });

      res.status(201).json({
        success: true,
        data: {
          runId: result.run.id,
          status: result.run.status,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal webhook processing error";
      res.status(500).json({
        success: false,
        error: {
          code: "WEBHOOK_PROCESSING_FAILED",
          message,
        },
      });
    }
  });

  return router;
}
