export interface HealthResponse {
  success: boolean;
  data?: {
    status: string;
    service: string;
    uptime: number;
    timestamp: string;
    database: {
      status: "connected" | "disconnected";
      message: string;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        success: false,
        error: {
          message: `Backend returned status ${res.status}`,
          code: "HTTP_ERROR",
        },
      };
    }

    const data: HealthResponse = await res.json();
    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to backend";
    return {
      success: false,
      error: {
        message,
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export interface WorkflowValidationError {
  message: string;
  nodeId?: string;
}

export interface WorkflowValidationResponse {
  success: boolean;
  data?: {
    isValid: boolean;
    errors: WorkflowValidationError[];
  };
  error?: {
    message: string;
    code: string;
  };
}

export async function validateWorkflowApi(
  workflow: unknown
): Promise<WorkflowValidationResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/workflows/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });

    if (!res.ok) {
      return {
        success: false,
        error: {
          message: `Backend validation returned status ${res.status}`,
          code: "HTTP_ERROR",
        },
      };
    }

    const data: WorkflowValidationResponse = await res.json();
    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to backend validator";
    return {
      success: false,
      error: {
        message,
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function fetchWorkflowsApi(): Promise<{ success: boolean; data?: WorkflowListItem[]; error?: { message: string } }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/workflows`, { cache: "no-store" });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : "Failed to fetch workflows" },
    };
  }
}

export interface WorkflowRecordResponse {
  id: string;
  name: string;
  description: string | null;
  graph_definition: import("../types/workflow-flow").VisualWorkflow;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function fetchWorkflowByIdApi(
  id: string
): Promise<{ success: boolean; data?: WorkflowRecordResponse; error?: { message: string; code?: string } }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/workflows/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to fetch workflow",
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export async function saveWorkflowApi(payload: {
  id: string;
  name: string;
  description?: string;
  graph_definition: unknown;
  version?: number;
}): Promise<{ success: boolean; data?: unknown; error?: { message: string; code?: string } }> {
  try {
    // 1. Try POST to create workflow (normal path for new workflows)
    const postRes = await fetch(`${API_BASE_URL}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const postData = await postRes.json();

    // 2. If workflow already exists (409 or DUPLICATE_ID), update via PUT
    if (postRes.status === 409 || postData.error?.code === "DUPLICATE_ID") {
      const putRes = await fetch(`${API_BASE_URL}/api/workflows/${encodeURIComponent(payload.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await putRes.json();
    }

    // 3. Otherwise return the POST response (either success or actual error)
    return postData;
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to save workflow",
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export async function deleteWorkflowApi(
  id: string
): Promise<{ success: boolean; message?: string; error?: { message: string; code?: string } }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to delete workflow",
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export type RunStatus = "requested" | "running" | "succeeded" | "failed" | "cancelled";
export type NodeRunStatus = "running" | "completed" | "failed" | "skipped";

export interface RunEventItem {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  input: unknown;
  output: unknown;
  error: { code: string; message: string; [key: string]: unknown } | null;
  branch?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  eventOrder: number;
  createdAt: string;
}

export interface RunListItem {
  id: string;
  workflowId: string;
  workflowVersion?: number;
  status: RunStatus;
  triggerType?: string;
  idempotencyKey: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: { code: string; message: string; [key: string]: unknown } | null;
  createdAt: string;
}

export interface RunDetail extends RunListItem {
  workflowSnapshot?: unknown;
  events: RunEventItem[];
}

export async function triggerRunApi(
  workflowId: string,
  idempotencyKey?: string
): Promise<{ success: boolean; data?: { runId: string; status: RunStatus; error?: unknown }; error?: { message: string; code?: string } }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    const res = await fetch(`${API_BASE_URL}/api/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workflowId, idempotencyKey }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : "Failed to trigger run" },
    };
  }
}

export async function fetchRunsApi(filter?: {
  workflowId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; data?: RunListItem[]; pagination?: { page: number; limit: number; total: number; totalPages: number }; error?: { message: string } }> {
  try {
    const params = new URLSearchParams();
    if (filter?.workflowId) params.append("workflowId", filter.workflowId);
    if (filter?.status) params.append("status", filter.status);
    if (filter?.page) params.append("page", filter.page.toString());
    if (filter?.limit) params.append("limit", filter.limit.toString());

    const url = `${API_BASE_URL}/api/runs${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : "Failed to fetch runs" },
    };
  }
}

export async function fetchRunDetailApi(
  runId: string
): Promise<{ success: boolean; data?: RunDetail; error?: { message: string } }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/runs/${runId}`, { cache: "no-store" });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : "Failed to fetch run details" },
    };
  }
}

export async function clearRunsApi(
  workflowId?: string
): Promise<{ success: boolean; data?: { deletedCount: number }; error?: { message: string } }> {
  try {
    const url = workflowId
      ? `${API_BASE_URL}/api/runs?workflowId=${encodeURIComponent(workflowId)}`
      : `${API_BASE_URL}/api/runs`;
    const res = await fetch(url, { method: "DELETE" });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : "Failed to clear execution history" },
    };
  }
}

import type { NodeManifest } from "../types/workflow-flow";

export async function fetchNodeManifestsApi(): Promise<{
  success: boolean;
  data?: NodeManifest[];
  error?: { message: string; code?: string };
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/nodes`, {
      cache: "no-store",
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: {
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch node manifests",
        code: "CONNECTION_ERROR",
      },
    };
  }
}

export interface NodeConfigValidationIssue {
  field: string;
  message: string;
}

export interface NodeConfigValidationResponse {
  success: boolean;
  data?: {
    isValid: boolean;
    errors: NodeConfigValidationIssue[];
  };
  error?: {
    message: string;
    code?: string;
  };
}

export async function validateNodeConfigApi(
  type: string,
  config: unknown
): Promise<NodeConfigValidationResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/nodes/validate-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, config }),
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: {
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate node configuration",
        code: "CONNECTION_ERROR",
      },
    };
  }
}



