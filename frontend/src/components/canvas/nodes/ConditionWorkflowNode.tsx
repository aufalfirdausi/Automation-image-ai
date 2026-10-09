import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BaseWorkflowNode } from "./BaseWorkflowNode";
import type { CanvasNode } from "../../../types/workflow-flow";

export const ConditionWorkflowNode = memo(function ConditionWorkflowNode({
  id,
  data,
  selected,
}: NodeProps<CanvasNode>) {
  return (
    <BaseWorkflowNode id={id} data={data} selected={selected}>
      {/* Target input handle on left */}
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

      {/* Named 'true' branch source handle */}
      <div
        style={{
          position: "absolute",
          right: "-12px",
          top: "25%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="true"
          style={{
            position: "static",
            transform: "none",
            width: "10px",
            height: "10px",
            backgroundColor: "var(--status-green)",
            border: "2px solid var(--bg-primary)",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: "14px",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--status-green)",
            pointerEvents: "none",
          }}
        >
          TRUE
        </span>
      </div>

      {/* Named 'false' branch source handle */}
      <div
        style={{
          position: "absolute",
          right: "-12px",
          top: "70%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="false"
          style={{
            position: "static",
            transform: "none",
            width: "10px",
            height: "10px",
            backgroundColor: "var(--status-red)",
            border: "2px solid var(--bg-primary)",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: "14px",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--status-red)",
            pointerEvents: "none",
          }}
        >
          FALSE
        </span>
      </div>
    </BaseWorkflowNode>
  );
});
