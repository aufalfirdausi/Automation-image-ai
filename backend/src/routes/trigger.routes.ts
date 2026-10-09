import { Router, type Request, type Response } from "express";
import { TriggerRepository } from "../repositories/trigger.repository.js";
import { WorkflowRepository } from "../repositories/workflow.repository.js";
import type { TriggerType } from "../triggers/types.js";

export function createTriggerRoutes(
  triggerRepo = new TriggerRepository(),
  workflowRepo = new WorkflowRepository()
): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const workflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : undefined;
      const type = typeof req.query.type === "string" ? (req.query.type as TriggerType) : undefined;
      const enabled =
        typeof req.query.enabled === "string" ? req.query.enabled === "true" : undefined;

      const records = await triggerRepo.listTriggers({ workflowId, type, enabled });
      res.json({
        success: true,
        data: records.map((r) => triggerRepo.toDto(r)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list triggers";
      res.status(500).json({ success: false, error: { message } });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { workflowId, type, config, enabled } = req.body || {};

      if (!workflowId || typeof workflowId !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_WORKFLOW_ID", message: "workflowId is required" },
        });
        return;
      }

      if (type !== "schedule" && type !== "webhook") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_TRIGGER_TYPE",
            message: "type must be 'schedule' or 'webhook'",
          },
        });
        return;
      }

      if (!config || typeof config !== "object") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_CONFIG", message: "config object is required" },
        });
        return;
      }

      // Verify workflow exists
      const workflow = await workflowRepo.getWorkflowById(workflowId);
      if (!workflow) {
        res.status(404).json({
          success: false,
          error: { code: "WORKFLOW_NOT_FOUND", message: `Workflow '${workflowId}' not found` },
        });
        return;
      }

      // Check unique webhook path if type === 'webhook'
      if (type === "webhook") {
        if (!config.path || typeof config.path !== "string") {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_CONFIG", message: "config.path is required for webhook triggers" },
          });
          return;
        }
        const existing = await triggerRepo.getTriggerByWebhookPath(config.path);
        if (existing) {
          res.status(409).json({
            success: false,
            error: {
              code: "WEBHOOK_PATH_CONFLICT",
              message: `Webhook path '${config.path}' is already registered`,
            },
          });
          return;
        }
      }

      const created = await triggerRepo.createTrigger({
        workflowId,
        type,
        config,
        enabled,
      });

      res.status(201).json({
        success: true,
        data: triggerRepo.toDto(created),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create trigger";
      res.status(500).json({ success: false, error: { message } });
    }
  });

  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const trigger = await triggerRepo.getTriggerById(req.params.id);
      if (!trigger) {
        res.status(404).json({
          success: false,
          error: { code: "TRIGGER_NOT_FOUND", message: "Trigger not found" },
        });
        return;
      }

      res.json({
        success: true,
        data: triggerRepo.toDto(trigger),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch trigger";
      res.status(500).json({ success: false, error: { message } });
    }
  });

  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const { config, enabled } = req.body || {};
      const updated = await triggerRepo.updateTrigger(req.params.id, { config, enabled });
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: "TRIGGER_NOT_FOUND", message: "Trigger not found" },
        });
        return;
      }

      res.json({
        success: true,
        data: triggerRepo.toDto(updated),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update trigger";
      res.status(500).json({ success: false, error: { message } });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await triggerRepo.deleteTrigger(req.params.id);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "TRIGGER_NOT_FOUND", message: "Trigger not found" },
        });
        return;
      }

      res.json({
        success: true,
        data: { id: req.params.id, deleted: true },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete trigger";
      res.status(500).json({ success: false, error: { message } });
    }
  });

  return router;
}
