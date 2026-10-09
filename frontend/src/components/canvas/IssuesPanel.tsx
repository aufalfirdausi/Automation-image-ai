"use client";

import React from "react";
import type { WorkflowValidationError } from "../../lib/api";

export interface IssuesPanelProps {
  errors: WorkflowValidationError[];
  isValid: boolean;
  validating?: boolean;
}

export function IssuesPanel({ errors, isValid, validating = false }: IssuesPanelProps) {
  if (validating) {
    return (
      <div
        style={{
          padding: "8px 14px",
          borderRadius: "6px",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          border: "1px solid var(--accent-blue)",
          fontSize: "0.8rem",
          color: "var(--accent-blue)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--accent-blue)" }} />
        Validating workflow on server...
      </div>
    );
  }

  if (isValid && errors.length === 0) {
    return (
      <div
        style={{
          padding: "8px 14px",
          borderRadius: "6px",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          border: "1px solid var(--status-green)",
          fontSize: "0.8rem",
          color: "var(--status-green)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--status-green)" }} />
        Workflow graph is valid (DAG OK)
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: "6px",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        border: "1px solid var(--status-red)",
        fontSize: "0.8rem",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--status-red)" }}>
        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--status-red)" }} />
        Validation Issues ({errors.length}):
      </div>
      <ul style={{ paddingLeft: "18px", margin: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        {errors.map((err, i) => (
          <li key={i} style={{ color: "var(--text-primary)" }}>
            {err.message}
            {err.nodeId && (
              <span style={{ marginLeft: "6px", color: "var(--accent-blue)", fontFamily: "monospace" }}>
                [{err.nodeId}]
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
