import { Router } from "express";
import healthRoutes from "./health.routes.js";
import workflowRoutes from "./workflow.routes.js";
import nodeRoutes from "./node.routes.js";
import runRoutes from "./run.routes.js";
import { createTriggerRoutes } from "./trigger.routes.js";
import { createWebhookRoutes } from "./webhook.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRoutes);
apiRouter.use("/workflows", workflowRoutes);
apiRouter.use("/nodes", nodeRoutes);
apiRouter.use("/runs", runRoutes);
apiRouter.use("/triggers", createTriggerRoutes());
apiRouter.use("/webhooks", createWebhookRoutes());

export default apiRouter;

