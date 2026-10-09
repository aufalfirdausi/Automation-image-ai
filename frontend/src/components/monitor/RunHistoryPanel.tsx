"use client";

import React from "react";
import type { RunListItem, RunStatus } from "../../lib/api";

export interface RunHistoryPanelProps {
  runs: RunListItem[];
  loading: boolean;
  clearing?: boolean;
  selectedRunId?: string | null;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
  onClearHistory?: () => void;
}

export function RunHistoryPanel({
  runs,
  loading,
  clearing = false,
  selectedRunId,
  onSelectRun,
  onRefresh,
  onClearHistory,
}: RunHistoryPanelProps) {
  const getBadgeClass = (status: RunStatus) => {
    switch (status) {
      case "succeeded":
        return "badge-succeeded";
      case "failed":
        return "badge-failed";
      case "running":
        return "badge-running";
      case "requested":
        return "badge-requested";
      case "cancelled":
        return "badge-cancelled";
      default:
        return "badge-unknown";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Execution History
        </h4>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {onClearHistory && (
            <button
              onClick={onClearHistory}
              disabled={loading || clearing || runs.length === 0}
              style={{
                background: "transparent",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "var(--status-red)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "0.75rem",
                cursor: loading || clearing || runs.length === 0 ? "not-allowed" : "pointer",
                opacity: runs.length === 0 || loading || clearing ? 0.4 : 1,
              }}
              title="Clear execution history"
            >
              {clearing ? "..." : "Clear"}
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading || clearing}
            style={{
              background: "transparent",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "0.75rem",
              cursor: loading || clearing ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading && runs.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "12px 0" }}>
          Loading runs...
        </div>
      ) : runs.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "12px 0" }}>
          No runs recorded yet. Click &quot;Execute Workflow&quot; to trigger a run.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "240px" }}>
          {runs.map((run) => {
            const isSelected = run.id === selectedRunId;
            const startTime = run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : "-";
            const duration =
              run.startedAt && run.finishedAt
                ? `${new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()}ms`
                : "-";

            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  border: isSelected ? "1px solid var(--accent-blue)" : "1px solid var(--border-color)",
                  backgroundColor: isSelected ? "rgba(56, 189, 248, 0.08)" : "var(--bg-primary)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  fontSize: "0.8rem",
                  transition: "border-color 0.15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {run.id.slice(0, 16)}...
                  </span>
                  <span className={`status-badge ${getBadgeClass(run.status)}`} style={{ margin: 0, fontSize: "0.7rem", padding: "2px 8px" }}>
                    {run.status}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  <span>Started: {startTime}</span>
                  <span>Duration: {duration}</span>
                </div>

                {run.error && (
                  <div
                    style={{
                      color: "var(--status-red)",
                      fontSize: "0.72rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Error: {run.error.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
