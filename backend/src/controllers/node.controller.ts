import type { Request, Response } from "express";
import { defaultNodeRegistry, validateNodeConfig } from "../nodes/index.js";

/**
 * Controller to expose read-only node manifests to the frontend editor.
 */
export function listNodesHandler(_req: Request, res: Response): void {
  const manifests = defaultNodeRegistry.listManifests();

  res.status(200).json({
    success: true,
    data: manifests,
  });
}

/**
 * Validates a node's configuration payload against its registered manifest.
 */
export function validateNodeConfigHandler(req: Request, res: Response): void {
  const { type, config } = req.body;

  if (!type || typeof type !== "string") {
    res.status(400).json({
      success: false,
      error: { message: "Field 'type' is required", code: "VALIDATION_ERROR" },
    });
    return;
  }

  const manifest = defaultNodeRegistry.getManifest(type);
  if (!manifest) {
    res.status(404).json({
      success: false,
      error: {
        message: `Node type '${type}' is not registered`,
        code: "HANDLER_NOT_FOUND",
      },
    });
    return;
  }

  const validation = validateNodeConfig(manifest, config);

  res.status(200).json({
    success: true,
    data: validation,
  });
}

