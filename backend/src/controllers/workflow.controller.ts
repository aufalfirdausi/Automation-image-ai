import type { Request, Response } from "express";
import { validateWorkflow } from "../engine/validate-workflow.js";
import type { Workflow } from "../engine/types.js";
import { WorkflowRepository } from "../repositories/workflow.repository.js";

const repository = new WorkflowRepository();

/**
 * Controller handling workflow validation and authoring contracts.
 */
export async function validateWorkflowHandler(req: Request, res: Response): Promise<void> {
  const workflow = req.body as Workflow;

  const result = validateWorkflow(workflow);

  // Parse structured errors to identify node/edge references where possible
  const formattedErrors = result.errors.map((msg) => {
    let nodeId: string | undefined = undefined;

    // Detect duplicate node ID or node validation pattern
    const nodeMatch = msg.match(/node (?:ID: )?'([^']+)'/i);
    if (nodeMatch && nodeMatch[1]) {
      nodeId = nodeMatch[1];
    }

    return {
      message: msg,
      nodeId,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      isValid: result.isValid,
      errors: formattedErrors,
    },
  });
}

/**
 * List all stored workflows (metadata).
 */
export async function listWorkflowsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const list = await repository.listWorkflows();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to list workflows",
        code: "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Retrieve single workflow by ID.
 */
export async function getWorkflowByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const workflow = await repository.getWorkflowById(id);

    if (!workflow) {
      res.status(404).json({
        success: false,
        error: { message: `Workflow '${id}' not found`, code: "NOT_FOUND" },
      });
      return;
    }

    res.status(200).json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to fetch workflow",
        code: "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Create new workflow with server-side validation.
 */
export async function createWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id, name, description, graph_definition } = req.body;

    if (!id || !name || !graph_definition) {
      res.status(400).json({
        success: false,
        error: {
          message: "Fields 'id', 'name', and 'graph_definition' are required",
          code: "VALIDATION_ERROR",
        },
      });
      return;
    }

    // Server-side validation gate
    const validation = validateWorkflow(graph_definition);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: {
          message: `Cannot persist invalid workflow: ${validation.errors.join("; ")}`,
          code: "INVALID_WORKFLOW",
          details: validation.errors,
        },
      });
      return;
    }

    const created = await repository.createWorkflow(id, name, description || null, graph_definition);
    res.status(201).json({ success: true, data: created });
  } catch (error: unknown) {
    const isDup = typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ER_DUP_ENTRY";
    res.status(isDup ? 409 : 500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to create workflow",
        code: isDup ? "DUPLICATE_ID" : "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Update workflow definition with version check and validation.
 */
export async function updateWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, description, graph_definition, version } = req.body;

    if (!name || !graph_definition) {
      res.status(400).json({
        success: false,
        error: {
          message: "Fields 'name' and 'graph_definition' are required",
          code: "VALIDATION_ERROR",
        },
      });
      return;
    }

    // Server-side validation gate
    const validation = validateWorkflow(graph_definition);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: {
          message: `Cannot persist invalid workflow: ${validation.errors.join("; ")}`,
          code: "INVALID_WORKFLOW",
          details: validation.errors,
        },
      });
      return;
    }

    const result = await repository.updateWorkflow(id, name, description || null, graph_definition, version);

    if (!result.updated) {
      res.status(409).json({
        success: false,
        error: {
          message: "Workflow update conflict: the record was updated elsewhere or not found",
          code: "CONCURRENCY_CONFLICT",
        },
      });
      return;
    }

    res.status(200).json({ success: true, message: "Workflow updated successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to update workflow",
        code: "DATABASE_ERROR",
      },
    });
  }
}

/**
 * Delete workflow by ID.
 */
export async function deleteWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await repository.deleteWorkflow(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { message: `Workflow '${id}' not found`, code: "NOT_FOUND" },
      });
      return;
    }

    res.status(200).json({ success: true, message: "Workflow deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to delete workflow",
        code: "DATABASE_ERROR",
      },
    });
  }
}
