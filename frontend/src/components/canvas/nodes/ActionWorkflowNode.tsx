import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BaseWorkflowNode } from "./BaseWorkflowNode";
import type { CanvasNode } from "../../../types/workflow-flow";

export const ActionWorkflowNode = memo(function ActionWorkflowNode({
  id,
  data,
  selected,
}: NodeProps<CanvasNode>) {
  return (
    <BaseWorkflowNode id={id} data={data} selected={selected}>
      {/* Target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: "10px",
          height: "10px",
          backgroundColor: "var(--text-muted)",
          border: "2px solid var(--bg-primary)",
        }}
      />

      {/* Default source handle on right */}
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
