import type { Request, Response } from "express";
import {
  ExecutionService,
  WorkflowNotFoundError,
  InvalidWorkflowError,
  NodeHandlerNotFoundError,
  InvalidNodeConfigError,
} from "../services/execution.service.js";

const service = new ExecutionService();

/**
 * Controller to trigger a workflow run.
 */
export async function startRunHandler(req: Request, res: Response): Promise<void> {
  try {
    const { workflowId, triggerType } = req.body;
    const idempotencyKey =
      req.body?.idempotencyKey || (req.headers["x-idempotency-key"] as string) || undefined;

    if (!workflowId || typeof workflowId !== "string" || workflowId.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: {
          message: "Field 'workflowId' is required",
          code: "VALIDATION_ERROR",
        },
      });
      return;
    }

    const { run, idempotentReplay } = await service.startRun({
      workflowId: workflowId.trim(),
      idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
      triggerType: triggerType === "api" ? "api" : "manual",
    });

    if (idempotentReplay) {
      res.setHeader("Idempotent-Replay", "true");
      res.status(200).json({
        success: true,
        data: run,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: run,
    });
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      res.status(404).json({
        success: false,
        error: { message: error.message, code: error.code },
      });
      return;
    }

    if (error instanceof InvalidWorkflowError) {
      res.status(400).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
      });
      return;
    }

    if (error instanceof NodeHandlerNotFoundError) {
      res.status(400).json({
        success: false,
        error: { message: error.message, code: error.code },
      });
      return;
    }

    if (error instanceof InvalidNodeConfigError) {
      res.status(400).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Internal execution error";
    res.status(500).json({
      success: false,
      error: {
        message,
        code: "EXECUTION_ERROR",
      },
    });
  }
}

/**
 * Controller to fetch run status and details by run ID.
 */
export async function getRunByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const run = await service.getRun(id);

    if (!run) {
      res.status(404).json({
        success: false,
        error: {
          message: `Run '${id}' not found`,
          code: "NOT_FOUND",
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: run,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch run";
    res.status(500).json({
      success: false,
      error: {
        message,
        code: "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Controller to list runs with pagination and filtering.
 */
export async function listRunsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { workflowId, status, page, limit } = req.query;

    const result = await service.listRuns({
      workflowId: typeof workflowId === "string" ? workflowId : undefined,
      status: typeof status === "string" ? (status as any) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.runs,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list runs";
    res.status(500).json({
      success: false,
      error: {
        message,
        code: "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Controller to clear workflow execution history.
 */
export async function clearRunsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { workflowId } = req.query;
    const result = await service.clearRuns(
      typeof workflowId === "string" && workflowId.trim().length > 0
        ? workflowId.trim()
        : undefined
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to clear runs";
    res.status(500).json({
      success: false,
      error: {
        message,
        code: "DATABASE_ERROR",
      },
    });
  }
}

