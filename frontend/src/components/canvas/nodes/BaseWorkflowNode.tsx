import React, { memo } from "react";
import type { WorkflowNodeData } from "../../../types/workflow-flow";

export interface BaseWorkflowNodeProps {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
  children?: React.ReactNode;
}

export const BaseWorkflowNode = memo(function BaseWorkflowNode({
  id,
  data,
  selected = false,
  children,
}: BaseWorkflowNodeProps) {
  const statusColor =
    data.status === "completed"
      ? "var(--status-green)"
      : data.status === "failed"
      ? "var(--status-red)"
      : data.status === "running"
      ? "var(--status-yellow)"
      : "var(--text-muted)";

  const borderStyle = data.hasError
    ? "2px solid var(--status-red)"
    : selected
    ? "2px solid var(--accent-blue)"
    : "1px solid var(--border-color)";

  return (
    <div
      style={{
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        padding: "12px 16px",
        borderRadius: "8px",
        minWidth: "180px",
        border: borderStyle,
        boxShadow: selected
          ? "0 0 0 2px rgba(56, 189, 248, 0.3)"
          : "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--accent-blue)",
            letterSpacing: "0.05em",
          }}
        >
          {data.nodeType}
        </span>
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: statusColor,
          }}
          title={`Status: ${data.status || "idle"}`}
        />
      </div>

      <div
        style={{
          fontWeight: 600,
          fontSize: "0.95rem",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {data.label || id}
      </div>

      {data.hasError && data.errorMessages && data.errorMessages.length > 0 && (
        <div
          style={{
            marginTop: "6px",
            fontSize: "0.75rem",
            color: "var(--status-red)",
          }}
        >
          {data.errorMessages[0]}
        </div>
      )}

      {children}
    </div>
  );
});
