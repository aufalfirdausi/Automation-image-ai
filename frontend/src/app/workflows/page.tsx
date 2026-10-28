"use client";

import React, { useState, useCallback, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkflowCanvas, type WorkflowCanvasRef } from "../../components/canvas/WorkflowCanvas";
import { NodeConfigForm } from "../../components/canvas/NodeConfigForm";
import { IssuesPanel } from "../../components/canvas/IssuesPanel";
import { RunHistoryPanel } from "../../components/monitor/RunHistoryPanel";
import { RunDetailModal } from "../../components/monitor/RunDetailModal";
import { flowToWorkflow, workflowToFlow } from "../../lib/workflow-mapper";
import {
  validateWorkflowApi,
  saveWorkflowApi,
  deleteWorkflowApi,
  triggerRunApi,
  fetchRunsApi,
  fetchRunDetailApi,
  clearRunsApi,
  fetchWorkflowByIdApi,
  fetchNodeManifestsApi,
  type WorkflowValidationError,
  type RunListItem,
  type RunDetail,
} from "../../lib/api";
import type { CanvasNode, CanvasEdge, VisualWorkflow, NodeManifest } from "../../types/workflow-flow";

function WorkflowEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryId = searchParams.get("id");
  const targetWorkflowId = queryId && queryId.trim() !== "" ? queryId.trim() : "workflow_demo";

  const [currentWorkflow, setCurrentWorkflow] = useState<VisualWorkflow>({
    id: targetWorkflowId,
    name: targetWorkflowId === "workflow_demo" ? "Visual Workflow Draft" : targetWorkflowId,
    nodes: [],
    edges: [],
  });
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [manifests, setManifests] = useState<NodeManifest[]>([]);
  const canvasRef = useRef<WorkflowCanvasRef | null>(null);

  const handleUpdateNodeConfig = useCallback(
    (nodeId: string, newConfig: Record<string, unknown>) => {
      setSelectedNode((prev) => {
        if (!prev || prev.id !== nodeId) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            config: newConfig,
          },
        };
      });
      canvasRef.current?.updateNodeConfig(nodeId, newConfig);
    },
    []
  );

  // Workflow loading states
  const [loadingWorkflow, setLoadingWorkflow] = useState<boolean>(true);
  const [workflowExists, setWorkflowExists] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialFlowData, setInitialFlowData] = useState<{
    nodes: CanvasNode[];
    edges: CanvasEdge[];
  }>({ nodes: [], edges: [] });

  // Validation states
  const [isValid, setIsValid] = useState<boolean>(true);
  const [validationErrors, setValidationErrors] = useState<WorkflowValidationError[]>([]);
  const [validating, setValidating] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Execution states
  const [executing, setExecuting] = useState<boolean>(false);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState<boolean>(false);
  const [clearingRuns, setClearingRuns] = useState<boolean>(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [loadingRunDetail, setLoadingRunDetail] = useState<boolean>(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState<boolean>(false);
  const [nodeStatusMap, setNodeStatusMap] = useState<
    Record<string, "idle" | "running" | "completed" | "failed" | "skipped">
  >({});

  // Unsaved changes state
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform server-side validation using debouncing
  const triggerValidation = useCallback(async (workflowToValidate: VisualWorkflow) => {
    setValidating(true);
    const response = await validateWorkflowApi(workflowToValidate);
    setValidating(false);

    if (response.success && response.data) {
      setIsValid(response.data.isValid);
      setValidationErrors(response.data.errors);
    } else {
      setIsValid(false);
      setValidationErrors([
        {
          message: response.error?.message || "Failed to communicate with validation endpoint",
        },
      ]);
    }
  }, []);

  // Fetch node manifests from backend registry on mount
  useEffect(() => {
    async function loadManifests() {
      const res = await fetchNodeManifestsApi();
      if (res.success && res.data) {
        setManifests(res.data);
      }
    }
    loadManifests();
  }, []);

  // Load workflow from database on mount
  const loadWorkflow = useCallback(
    async (workflowId: string, currentManifests?: NodeManifest[]) => {
      setLoadingWorkflow(true);
      setLoadError(null);
      const res = await fetchWorkflowByIdApi(workflowId);
      if (res.success && res.data) {
        const loadedWorkflow = res.data.graph_definition;
        const { nodes, edges } = workflowToFlow(
          loadedWorkflow,
          undefined,
          currentManifests || manifests
        );
        setCurrentWorkflow(loadedWorkflow);
        setWorkflowExists(true);
        setInitialFlowData({ nodes, edges });
        setIsDirty(false);
        triggerValidation(loadedWorkflow);
      } else if (res.error?.code === "NOT_FOUND" || res.error?.message?.includes("not found")) {
        // Brand new workflow (not yet saved to DB)
        setCurrentWorkflow({
          id: workflowId,
          name: workflowId === "workflow_demo" ? "Visual Workflow Draft" : workflowId,
          nodes: [],
          edges: [],
        });
        setWorkflowExists(false);
        setInitialFlowData({ nodes: [], edges: [] });
        setIsDirty(false);
      } else {
        // Unexpected server or network error
        setLoadError(res.error?.message || "Failed to load workflow from server");
      }
      setLoadingWorkflow(false);
    },
    [manifests, triggerValidation]
  );

  useEffect(() => {
    loadWorkflow(targetWorkflowId);
  }, [loadWorkflow, targetWorkflowId]);

  // Load runs for current workflow
  const loadRuns = useCallback(async () => {
    if (!currentWorkflow.id) return;
    setLoadingRuns(true);
    const res = await fetchRunsApi({ workflowId: currentWorkflow.id });
    if (res.success && res.data) {
      setRuns(res.data);
    }
    setLoadingRuns(false);
  }, [currentWorkflow.id]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Clear runs for current workflow
  const handleClearHistory = useCallback(async () => {
    if (!currentWorkflow.id) return;
    const confirmed = window.confirm(
      `Clear all execution history for workflow "${currentWorkflow.name}"?\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setClearingRuns(true);
    const res = await clearRunsApi(currentWorkflow.id);
    setClearingRuns(false);

    if (res.success) {
      setRuns([]);
      setActiveRunId(null);
      setRunDetail(null);
      setNodeStatusMap({});
    } else {
      alert(`Failed to clear history: ${res.error?.message || "Unknown error"}`);
    }
  }, [currentWorkflow.id, currentWorkflow.name]);

  // Select a run and load its detail & map node statuses
  const handleSelectRun = useCallback(async (runId: string) => {
    setActiveRunId(runId);
    setLoadingRunDetail(true);
    const res = await fetchRunDetailApi(runId);
    setLoadingRunDetail(false);
    if (res.success && res.data) {
      setRunDetail(res.data);
      setIsRunModalOpen(true);
      // Map node events to status map
      const nextMap: Record<string, "idle" | "running" | "completed" | "failed" | "skipped"> = {};
      for (const evt of res.data.events) {
        nextMap[evt.nodeId] = evt.status;
      }
      setNodeStatusMap(nextMap);
    }
  }, []);

  // Trigger run
  const handleRunWorkflow = useCallback(async () => {
    if (!isValid || validating || saving || executing) return;
    setExecuting(true);
    try {
      // First ensure workflow is saved in DB so the snapshot can execute
      const saveRes = await saveWorkflowApi({
        id: currentWorkflow.id,
        name: currentWorkflow.name,
        graph_definition: currentWorkflow,
      }, workflowExists);
      if (!saveRes.success) {
        alert(`Failed to save workflow before running: ${saveRes.error?.message || "Unknown error"}`);
        return;
      }
      setWorkflowExists(true);
      setIsDirty(false);

      const runRes = await triggerRunApi(currentWorkflow.id);
      if (runRes.success && runRes.data) {
        const runId = runRes.data.runId;
        await loadRuns();
        await handleSelectRun(runId);
      } else {
        alert(`Failed to start run: ${runRes.error?.message || "Unknown error"}`);
      }
    } finally {
      setExecuting(false);
    }
  }, [currentWorkflow, executing, handleSelectRun, isValid, loadRuns, saving, validating, workflowExists]);

  const handleGraphChange = useCallback(
    (nodes: CanvasNode[], edges: CanvasEdge[]) => {
      setIsDirty(true);
      const serialized = flowToWorkflow(nodes, edges, {
        id: currentWorkflow.id,
        name: currentWorkflow.name,
      });
      setCurrentWorkflow(serialized);

      // Debounce server validation call (500ms)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerValidation(serialized);
      }, 500);
    },
    [currentWorkflow.id, currentWorkflow.name, triggerValidation]
  );

  // Warn on window reload/exit if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isDirty]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "var(--bg-primary)" }}>
      {/* Navigation Header */}
      <header
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/"
            style={{
              color: "var(--accent-blue)",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            &larr; Dashboard
          </Link>
          <span style={{ color: "var(--border-color)" }}>|</span>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            {currentWorkflow.name}
          </h1>
          {isDirty ? (
            <span className="status-badge badge-pending">Unsaved Changes</span>
          ) : (
            <span className="status-badge badge-connected">Saved</span>
          )}
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {currentWorkflow.nodes.length} Nodes &bull; {currentWorkflow.edges.length} Edges
          </span>
          <button
            disabled={!isValid || validating || saving || executing}
            className="btn-primary"
            style={{
              opacity: !isValid || validating || saving || executing ? 0.5 : 1,
              cursor: !isValid || validating || saving || executing ? "not-allowed" : "pointer",
              padding: "8px 16px",
              fontSize: "0.85rem",
            }}
            onClick={async () => {
              setSaving(true);
              const res = await saveWorkflowApi({
                id: currentWorkflow.id,
                name: currentWorkflow.name,
                graph_definition: currentWorkflow,
              }, workflowExists);
              setSaving(false);
              if (res.success) {
                setWorkflowExists(true);
                setIsDirty(false);
                alert("Workflow saved successfully to database!");
              } else {
                alert(`Save failed: ${res.error?.message || "Unknown error"}`);
              }
            }}
          >
            {saving ? "Saving..." : "Save Workflow"}
          </button>
          <button
            disabled={!isValid || validating || saving || executing || deleting}
            className="btn-primary"
            style={{
              backgroundColor: "var(--status-green)",
              opacity: !isValid || validating || saving || executing || deleting ? 0.5 : 1,
              cursor: !isValid || validating || saving || executing || deleting ? "not-allowed" : "pointer",
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
            onClick={handleRunWorkflow}
          >
            {executing ? "Executing..." : "▶ Run Workflow"}
          </button>
          <button
            disabled={saving || executing || deleting}
            className="btn-primary"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "var(--status-red)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              opacity: saving || executing || deleting ? 0.5 : 1,
              cursor: saving || executing || deleting ? "not-allowed" : "pointer",
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
            onClick={async () => {
              const confirmed = window.confirm(
                `Are you sure you want to delete workflow "${currentWorkflow.name}" (${currentWorkflow.id})?\nThis action cannot be undone.`
              );
              if (!confirmed) return;

              setDeleting(true);
              const res = await deleteWorkflowApi(currentWorkflow.id);
              setDeleting(false);

              if (res.success) {
                setIsDirty(false);
                router.push("/");
              } else {
                alert(`Delete failed: ${res.error?.message || "Unknown error"}`);
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete Workflow"}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas Area */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          {loadingWorkflow ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <span style={{ fontSize: "1rem", fontWeight: 600 }}>Loading workflow canvas...</span>
              <span style={{ fontSize: "0.85rem" }}>Restoring nodes and connections from database</span>
            </div>
          ) : loadError ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: "16px",
                color: "var(--status-red)",
                padding: "24px",
              }}
            >
              <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>Failed to Load Workflow</span>
              <p style={{ color: "var(--text-secondary)", maxWidth: "480px", textAlign: "center", margin: 0 }}>
                {loadError}
              </p>
              <button
                className="btn-primary"
                onClick={() => loadWorkflow(currentWorkflow.id)}
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <WorkflowCanvas
              ref={canvasRef}
              key={currentWorkflow.id}
              initialNodes={initialFlowData.nodes}
              initialEdges={initialFlowData.edges}
              manifests={manifests}
              nodeStatusMap={nodeStatusMap}
              onGraphChange={handleGraphChange}
              onNodeSelect={(node) => setSelectedNode(node)}
            />
          )}
        </div>

        {/* Sidebar Inspector */}
        <aside
          style={{
            width: "360px",
            borderLeft: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-card)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            overflowY: "auto",
          }}
        >
          {/* Validation Status Panel */}
          <section>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Graph Validation
            </h3>
            <IssuesPanel errors={validationErrors} isValid={isValid} validating={validating} />
          </section>

          {/* Node Inspector */}
          <section style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Node Inspector
            </h3>

            {selectedNode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.85rem" }}>
                <div>
                  <strong style={{ color: "var(--text-secondary)" }}>ID:</strong>
                  <p style={{ fontFamily: "monospace", marginTop: "4px" }}>{selectedNode.id}</p>
                </div>

                <div>
                  <strong style={{ color: "var(--text-secondary)" }}>Type:</strong>
                  <p style={{ marginTop: "4px" }}>{selectedNode.data.nodeType}</p>
                </div>

                {manifests.find((m) => m.type === selectedNode.data.nodeType)?.description && (
                  <div>
                    <strong style={{ color: "var(--text-secondary)" }}>Description:</strong>
                    <p style={{ marginTop: "4px", color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
                      {manifests.find((m) => m.type === selectedNode.data.nodeType)?.description}
                    </p>
                  </div>
                )}

                <div>
                  <strong style={{ color: "var(--text-secondary)" }}>Status:</strong>
                  <p style={{ marginTop: "4px" }}>{selectedNode.data.status || "idle"}</p>
                </div>

                {/* Schema-driven Node Configuration */}
                {(() => {
                  const selectedManifest = manifests.find((m) => m.type === selectedNode.data.nodeType);
                  if (selectedManifest && selectedManifest.configFields && selectedManifest.configFields.length > 0) {
                    return (
                      <div style={{ marginTop: "4px", borderTop: "1px dashed var(--border-color)", paddingTop: "12px" }}>
                        <strong style={{ display: "block", color: "var(--text-secondary)", marginBottom: "8px" }}>
                          Configuration
                        </strong>
                        <NodeConfigForm
                          manifest={selectedManifest}
                          config={selectedNode.data.config || {}}
                          onChange={(updated) => handleUpdateNodeConfig(selectedNode.id, updated)}
                        />
                      </div>
                    );
                  }
                  return (
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                      This node requires no additional configuration.
                    </p>
                  );
                })()}

                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                  <strong style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Raw Config:</strong>
                  <pre
                    style={{
                      marginTop: "6px",
                      padding: "8px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.75rem",
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(selectedNode.data.config, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Select a node on the canvas to inspect its configuration and properties.
              </p>
            )}
          </section>

          {/* Execution History Panel */}
          <section style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
            <RunHistoryPanel
              runs={runs}
              loading={loadingRuns}
              clearing={clearingRuns}
              selectedRunId={activeRunId}
              onSelectRun={handleSelectRun}
              onRefresh={loadRuns}
              onClearHistory={handleClearHistory}
            />
          </section>

          {/* Engine Payload Preview */}
          <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid var(--border-color)" }}>
            <h4 style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
              Engine Workflow JSON (Preview)
            </h4>
            <pre
              style={{
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                fontSize: "0.7rem",
                maxHeight: "140px",
                overflowY: "auto",
              }}
            >
              {JSON.stringify(currentWorkflow, null, 2)}
            </pre>
          </div>
        </aside>
      </div>

      {isRunModalOpen && (
        <RunDetailModal
          run={runDetail}
          loading={loadingRunDetail}
          onClose={() => setIsRunModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-secondary)",
          }}
        >
          Loading workflow editor...
        </div>
      }
    >
      <WorkflowEditorContent />
    </Suspense>
  );
}

