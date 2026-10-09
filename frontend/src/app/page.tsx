"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  fetchHealth,
  fetchRunsApi,
  fetchWorkflowsApi,
  deleteWorkflowApi,
  type HealthResponse,
  type RunListItem,
  type WorkflowListItem,
} from "../lib/api";

export default function DashboardPage() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunListItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    setDeleteError(null);
    const [hResult, runsResult, wfResult] = await Promise.all([
      fetchHealth(),
      fetchRunsApi({ limit: 5 }),
      fetchWorkflowsApi(),
    ]);
    setHealthData(hResult);
    if (runsResult.success && runsResult.data) {
      setRecentRuns(runsResult.data);
    }
    if (wfResult.success && wfResult.data) {
      setWorkflows(wfResult.data);
    }
    setLoading(false);
  }, []);

  const handleDeleteWorkflow = async (workflow: WorkflowListItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete workflow "${workflow.name}" (${workflow.id})?\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(workflow.id);
    setDeleteError(null);
    const res = await deleteWorkflowApi(workflow.id);
    setDeletingId(null);

    if (res.success) {
      setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
    } else {
      setDeleteError(res.error?.message || "Failed to delete workflow");
      alert(`Delete failed: ${res.error?.message || "Unknown error"}`);
    }
  };

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const isServerHealthy = healthData?.success && healthData.data?.status === "healthy";
  const dbStatus = healthData?.data?.database?.status;
  const isDbConnected = dbStatus === "connected";

  return (
    <main className="container">
      <header className="header">
        <h1>Personal AI Workflow Orchestrator</h1>
        <p>Local Personal AI Automation &bull; Phase 1 Foundation</p>
      </header>

      <section className="grid">
        {/* Backend Status Card */}
        <div className="card">
          <h2>Backend Service</h2>
          <div>
            Status:{" "}
            {loading ? (
              <span className="status-badge badge-pending">Checking...</span>
            ) : isServerHealthy ? (
              <span className="status-badge badge-connected">Healthy</span>
            ) : (
              <span className="status-badge badge-disconnected">Unreachable</span>
            )}
          </div>
          <div className="details">
            {healthData?.data ? (
              <>
                <p>Service: {healthData.data.service}</p>
                <p>Uptime: {Math.floor(healthData.data.uptime)}s</p>
                <p>Checked: {new Date(healthData.data.timestamp).toLocaleTimeString()}</p>
              </>
            ) : (
              <p>
                {healthData?.error?.message ||
                  "Ensure backend is running on http://localhost:5001"}
              </p>
            )}
          </div>
        </div>

        {/* Database Status Card */}
        <div className="card">
          <h2>MySQL Database</h2>
          <div>
            Status:{" "}
            {loading ? (
              <span className="status-badge badge-pending">Checking...</span>
            ) : !isServerHealthy ? (
              <span className="status-badge badge-unknown">Unavailable</span>
            ) : isDbConnected ? (
              <span className="status-badge badge-connected">Connected</span>
            ) : (
              <span className="status-badge badge-disconnected">Disconnected</span>
            )}
          </div>
          <div className="details">
            <p>
              {loading
                ? "Database status retrieved via backend health probe."
                : !isServerHealthy
                ? "Database status unavailable because backend is unreachable."
                : healthData?.data?.database?.message ||
                  "Database status retrieved via backend health probe."}
            </p>
          </div>
        </div>

        {/* Phase Roadmap Card */}
        <div className="card">
          <h2>Execution Engine</h2>
          <div className="details">
            <p>&bull; Deterministic DAG Runner</p>
            <p>&bull; MySQL Execution Snapshot &amp; Event Trace</p>
            <p>&bull; Real-time Node Status Overlays</p>
            <p>&bull; Safe Payload Redaction &amp; Truncation</p>
          </div>
        </div>

        {/* Saved Workflows Card */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Saved Workflows</h2>
            <Link
              href="/workflows"
              style={{
                color: "var(--accent-blue)",
                fontSize: "0.85rem",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              + Create New Workflow &rarr;
            </Link>
          </div>

          {deleteError && (
            <div style={{ marginTop: "10px", color: "var(--status-red)", fontSize: "0.85rem" }}>
              {deleteError}
            </div>
          )}

          <div className="details">
            {workflows.length === 0 ? (
              <p style={{ fontStyle: "italic", color: "var(--text-muted)", margin: "8px 0" }}>
                No workflows saved yet. Create and save a workflow in the editor to see it listed here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {wf.name}
                        </span>
                        <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          ({wf.id})
                        </span>
                        <span
                          className="status-badge"
                          style={{
                            margin: 0,
                            padding: "2px 6px",
                            fontSize: "0.65rem",
                            backgroundColor: "var(--bg-card)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          v{wf.version}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Updated: {new Date(wf.updated_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Link
                        href={`/workflows?id=${encodeURIComponent(wf.id)}`}
                        className="btn-primary"
                        style={{
                          padding: "5px 12px",
                          fontSize: "0.8rem",
                          textDecoration: "none",
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        Open Editor
                      </Link>
                      <button
                        onClick={() => handleDeleteWorkflow(wf)}
                        disabled={deletingId === wf.id}
                        className="btn-primary"
                        style={{
                          padding: "5px 12px",
                          fontSize: "0.8rem",
                          backgroundColor: "rgba(239, 68, 68, 0.15)",
                          color: "var(--status-red)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          cursor: deletingId === wf.id ? "not-allowed" : "pointer",
                          opacity: deletingId === wf.id ? 0.6 : 1,
                        }}
                      >
                        {deletingId === wf.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Runs Card */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Recent Execution Runs</h2>
            <a href="/workflows" style={{ color: "var(--accent-blue)", fontSize: "0.85rem", textDecoration: "none" }}>
              Open Editor &rarr;
            </a>
          </div>
          <div className="details">
            {recentRuns.length === 0 ? (
              <p style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                No workflow runs recorded yet. Execute a workflow in the editor to see run records here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                {recentRuns.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {r.id.slice(0, 16)}...
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        ({r.workflowId})
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : "-"}
                      </span>
                      <span className={`status-badge badge-${r.status}`} style={{ margin: 0, padding: "2px 8px", fontSize: "0.7rem" }}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="actions" style={{ display: "flex", gap: "14px", alignItems: "center" }}>
        <button
          onClick={checkConnection}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Checking..." : "Recheck Connection"}
        </button>
        <a
          href="/workflows"
          className="btn-primary"
          style={{
            textDecoration: "none",
            display: "inline-block",
            textAlign: "center",
            backgroundColor: "var(--accent-blue)",
            color: "var(--bg-primary)",
          }}
        >
          Open Workflow Editor &rarr;
        </a>
      </div>

      <aside className="footer-note">
        <strong>Phase 2 Preview:</strong> The visual workflow canvas (React Flow), node
        graph traversal, execution engine, and AI provider integrations will be implemented
        in subsequent phases according to <code>docs/PROJECT_PLAN.md</code>.
      </aside>
    </main>
  );
}
