import { Router } from "express";
import {
  startRunHandler,
  getRunByIdHandler,
  listRunsHandler,
  clearRunsHandler,
} from "../controllers/run.controller.js";

const router = Router();

// List runs (with pagination & filter)
router.get("/", listRunsHandler);

// Trigger execution run
router.post("/", startRunHandler);

// Clear execution runs
router.delete("/", clearRunsHandler);

// Query run status, metadata, and event trace
router.get("/:id", getRunByIdHandler);

export default router;
