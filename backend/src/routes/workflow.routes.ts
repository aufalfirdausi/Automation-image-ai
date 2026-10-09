import { Router } from "express";
import {
  validateWorkflowHandler,
  listWorkflowsHandler,
  getWorkflowByIdHandler,
  createWorkflowHandler,
  updateWorkflowHandler,
  deleteWorkflowHandler,
} from "../controllers/workflow.controller.js";

const router = Router();

// Validation
router.post("/validate", validateWorkflowHandler);

// CRUD
router.get("/", listWorkflowsHandler);
router.post("/", createWorkflowHandler);
router.get("/:id", getWorkflowByIdHandler);
router.put("/:id", updateWorkflowHandler);
router.delete("/:id", deleteWorkflowHandler);

export default router;
