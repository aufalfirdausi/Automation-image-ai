import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BaseWorkflowNode } from "./BaseWorkflowNode";
import type { CanvasNode } from "../../../types/workflow-flow";

export const TriggerWorkflowNode = memo(function TriggerWorkflowNode({
  id,
  data,
  selected,
}: NodeProps<CanvasNode>) {
  return (
    <BaseWorkflowNode id={id} data={data} selected={selected}>
      {/* Output source handle only (no input target handle for root/trigger) */}
      <Handle
        type="source"
        position={Position.Right}
        id="default"
        style={{
          width: "10px",
          height: "10px",
          backgroundColor: "var(--accent-blue)",
          border: "2px solid var(--bg-primary)",
        }}
      />
    </BaseWorkflowNode>
  );
});
