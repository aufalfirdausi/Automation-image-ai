"use client";

import React, { useState } from "react";
import type { RunDetail, NodeRunStatus } from "../../lib/api";

export interface RunDetailModalProps {
  run: RunDetail | null;
  loading: boolean;
  onClose: () => void;
}

export function RunDetailModal({ run, loading, onClose }: RunDetailModalProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  if (!run && !loading) return null;

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const getNodeBadgeClass = (status: NodeRunStatus) => {
    switch (status) {
      case "completed":
        return "badge-succeeded";
      case "failed":
        return "badge-failed";
      case "running":
        return "badge-running";
      case "skipped":
        return "badge-skipped";
      default:
        return "badge-unknown";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Run Execution Trace
            </h3>
            {run && (
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                ID: {run.id}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading && !run ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
              Loading execution trace...
            </div>
          ) : run ? (
            <>
              {/* Summary Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "10px",
                  padding: "12px",
                  backgroundColor: "var(--bg-primary)",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.8rem",
                }}
              >
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Overall Status</div>
                  <span className={`status-badge badge-${run.status === "succeeded" ? "succeeded" : run.status === "failed" ? "failed" : run.status === "running" ? "running" : "unknown"}`} style={{ marginTop: "4px", fontSize: "0.75rem" }}>
                    {run.status}
                  </span>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Events Recorded</div>
                  <div style={{ fontWeight: 600, marginTop: "4px" }}>{run.events?.length || 0} node events</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Started At</div>
                  <div style={{ fontWeight: 600, marginTop: "4px" }}>
                    {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : "-"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Duration</div>
                  <div style={{ fontWeight: 600, marginTop: "4px" }}>
                    {run.startedAt && run.finishedAt
                      ? `${new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()}ms`
                      : "-"}
                  </div>
                </div>
              </div>

              {/* Run Root Error */}
              {run.error && (
                <div
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    padding: "12px",
                    color: "var(--status-red)",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                    Execution Failure [{run.error.code}]:
                  </div>
                  <div>{run.error.message}</div>
                </div>
              )}

              {/* Events Breakdown */}
              <div>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "10px", color: "var(--text-primary)" }}>
                  Node Execution Events (Chronological)
                </h4>

                {(!run.events || run.events.length === 0) ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No node events recorded for this run.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {run.events.map((evt) => {
                      const isExpanded = expandedNodes[evt.id];
                      return (
                        <div
                          key={evt.id}
                          style={{
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            backgroundColor: "var(--bg-primary)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            onClick={() => toggleExpand(evt.id)}
                            style={{
                              padding: "10px 14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                #{evt.eventOrder}
                              </span>
                              <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                                {evt.nodeId}
                              </strong>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                ({evt.nodeType})
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {evt.durationMs !== null && evt.durationMs !== undefined
                                  ? `${evt.durationMs}ms`
                                  : evt.status === "running"
                                  ? "Running..."
                                  : "-"}
                              </span>
                              <span
                                className={`status-badge ${getNodeBadgeClass(evt.status)}`}
                                style={{ margin: 0, fontSize: "0.7rem", padding: "2px 8px" }}
                              >
                                {evt.status}
                              </span>
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {isExpanded ? "▲" : "▼"}
                              </span>
                            </div>
                          </div>

                          {/* Expanded Input / Output / Error Inspector */}
                          {isExpanded && (
                            <div
                              style={{
                                padding: "12px 14px",
                                borderTop: "1px solid var(--border-color)",
                                backgroundColor: "rgba(0, 0, 0, 0.2)",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                                fontSize: "0.75rem",
                              }}
                            >
                              <div style={{ display: "flex", gap: "16px", color: "var(--text-secondary)" }}>
                                <span>
                                  <strong>Started:</strong>{" "}
                                  {evt.startedAt ? new Date(evt.startedAt).toLocaleTimeString() : "-"}
                                </span>
                                {evt.finishedAt && (
                                  <span>
                                    <strong>Finished:</strong>{" "}
                                    {new Date(evt.finishedAt).toLocaleTimeString()}
                                  </span>
                                )}
                              </div>
                              {evt.error && (
                                <div style={{ color: "var(--status-red)" }}>
                                  <strong>Error:</strong> {evt.error.message}
                                </div>
                              )}
                              <div>
                                <strong style={{ color: "var(--text-secondary)" }}>Input:</strong>
                                <pre
                                  style={{
                                    marginTop: "4px",
                                    padding: "8px",
                                    borderRadius: "4px",
                                    backgroundColor: "var(--bg-primary)",
                                    border: "1px solid var(--border-color)",
                                    maxHeight: "120px",
                                    overflowY: "auto",
                                  }}
                                >
                                  {JSON.stringify(evt.input, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <strong style={{ color: "var(--text-secondary)" }}>Output:</strong>
                                <pre
                                  style={{
                                    marginTop: "4px",
                                    padding: "8px",
                                    borderRadius: "4px",
                                    backgroundColor: "var(--bg-primary)",
                                    border: "1px solid var(--border-color)",
                                    maxHeight: "120px",
                                    overflowY: "auto",
                                  }}
                                >
                                  {JSON.stringify(evt.output, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onClose} className="btn-primary" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
