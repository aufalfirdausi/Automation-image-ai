import type { NodeTypes } from "@xyflow/react";
import { TriggerWorkflowNode } from "./TriggerWorkflowNode";
import { ActionWorkflowNode } from "./ActionWorkflowNode";
import { ConditionWorkflowNode } from "./ConditionWorkflowNode";

/**
 * Stable, memoized mapping of custom node types registered for the React Flow canvas.
 * Kept outside of React component render lifecycles to avoid unnecessary canvas re-renders.
 */
export const workflowNodeTypes: NodeTypes = {
  triggerNode: TriggerWorkflowNode,
  actionNode: ActionWorkflowNode,
  conditionNode: ConditionWorkflowNode,
};
