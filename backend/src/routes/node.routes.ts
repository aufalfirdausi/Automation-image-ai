import { Router } from "express";
import { listNodesHandler, validateNodeConfigHandler } from "../controllers/node.controller.js";

const router = Router();

// Read-only node metadata
router.get("/", listNodesHandler);

// Validate node configuration
router.post("/validate-config", validateNodeConfigHandler);

export default router;
