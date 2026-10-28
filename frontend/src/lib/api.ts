export interface ApiError {
  message: string;
  code?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T | { success: false; error: ApiError }> {
  try {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => null)) as T | { error?: ApiError } | null;
    if (response.ok && body !== null) return body as T;

    return {
      success: false,
      error: {
        message: body && typeof body === "object" && "error" in body && body.error?.message
          ? body.error.message
          : `Backend returned status ${response.status}`,
        code: body && typeof body === "object" && "error" in body ? body.error?.code : "HTTP_ERROR",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Failed to connect to backend",
        code: "CONNECTION_ERROR",
      },
    };
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export interface HealthResponse {
  success: boolean;
  data?: {
    status: string;
    service: string;
    uptime: number;
    timestamp: string;
    database: { status: "connected" | "disconnected"; message: string };
  };
  error?: ApiError;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>(`${API_BASE_URL}/api/health`, { cache: "no-store" }) as Promise<HealthResponse>;
}

export interface WorkflowValidationError {
  message: string;
  nodeId?: string;
}

export interface WorkflowValidationResponse {
  success: boolean;
  data?: { isValid: boolean; errors: WorkflowValidationError[] };
  error?: ApiError;
}

export function validateWorkflowApi(workflow: unknown): Promise<WorkflowValidationResponse> {
  return requestJson<WorkflowValidationResponse>(`${API_BASE_URL}/api/workflows/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  }) as Promise<WorkflowValidationResponse>;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type WorkflowListResponse = { success: boolean; data?: WorkflowListItem[]; error?: ApiError };

export function fetchWorkflowsApi(): Promise<WorkflowListResponse> {
  return requestJson<WorkflowListResponse>(`${API_BASE_URL}/api/workflows`, { cache: "no-store" }) as Promise<WorkflowListResponse>;
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

export type WorkflowResponse = { success: boolean; data?: WorkflowRecordResponse; error?: ApiError };

export function fetchWorkflowByIdApi(id: string): Promise<WorkflowResponse> {
  return requestJson<WorkflowResponse>(`${API_BASE_URL}/api/workflows/${encodeURIComponent(id)}`, { cache: "no-store" }) as Promise<WorkflowResponse>;
}

export interface SaveWorkflowPayload {
  id: string;
  name: string;
  description?: string;
  graph_definition: unknown;
  version?: number;
}

export type MutationResponse = { success: boolean; data?: unknown; message?: string; error?: ApiError };

export async function saveWorkflowApi(
  payload: SaveWorkflowPayload,
  isExisting = false
): Promise<MutationResponse> {
  const url = isExisting
    ? `${API_BASE_URL}/api/workflows/${encodeURIComponent(payload.id)}`
    : `${API_BASE_URL}/api/workflows`;
  const response = await requestJson<MutationResponse>(url, {
    method: isExisting ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.success || isExisting || response.error?.code !== "DUPLICATE_ID") return response;

  return requestJson<MutationResponse>(`${API_BASE_URL}/api/workflows/${encodeURIComponent(payload.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteWorkflowApi(id: string): Promise<MutationResponse> {
  return requestJson<MutationResponse>(`${API_BASE_URL}/api/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }) as Promise<MutationResponse>;
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

export type TriggerRunResponse = {
  success: boolean;
  data?: { runId: string; status: RunStatus; error?: unknown };
  error?: ApiError;
};

export function triggerRunApi(workflowId: string, idempotencyKey?: string): Promise<TriggerRunResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return requestJson<TriggerRunResponse>(`${API_BASE_URL}/api/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ workflowId, idempotencyKey }),
  }) as Promise<TriggerRunResponse>;
}

export type RunListResponse = {
  success: boolean;
  data?: RunListItem[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  error?: ApiError;
};

export function fetchRunsApi(filter?: {
  workflowId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<RunListResponse> {
  const params = new URLSearchParams();
  if (filter?.workflowId) params.set("workflowId", filter.workflowId);
  if (filter?.status) params.set("status", filter.status);
  if (filter?.page) params.set("page", String(filter.page));
  if (filter?.limit) params.set("limit", String(filter.limit));
  const query = params.toString();
  return requestJson<RunListResponse>(`${API_BASE_URL}/api/runs${query ? `?${query}` : ""}`, {
    cache: "no-store",
  }) as Promise<RunListResponse>;
}

export type RunDetailResponse = { success: boolean; data?: RunDetail; error?: ApiError };

export function fetchRunDetailApi(runId: string): Promise<RunDetailResponse> {
  return requestJson<RunDetailResponse>(`${API_BASE_URL}/api/runs/${encodeURIComponent(runId)}`, {
    cache: "no-store",
  }) as Promise<RunDetailResponse>;
}

export type ClearRunsResponse = { success: boolean; data?: { deletedCount: number }; error?: ApiError };

export function clearRunsApi(workflowId?: string): Promise<ClearRunsResponse> {
  const url = workflowId
    ? `${API_BASE_URL}/api/runs?workflowId=${encodeURIComponent(workflowId)}`
    : `${API_BASE_URL}/api/runs`;
  return requestJson<ClearRunsResponse>(url, { method: "DELETE" }) as Promise<ClearRunsResponse>;
}

import type { NodeManifest } from "../types/workflow-flow";

export type NodeManifestResponse = { success: boolean; data?: NodeManifest[]; error?: ApiError };

export function fetchNodeManifestsApi(): Promise<NodeManifestResponse> {
  return requestJson<NodeManifestResponse>(`${API_BASE_URL}/api/nodes`, { cache: "no-store" }) as Promise<NodeManifestResponse>;
}

export interface NodeConfigValidationIssue {
  field: string;
  message: string;
}

export interface NodeConfigValidationResponse {
  success: boolean;
  data?: { isValid: boolean; errors: NodeConfigValidationIssue[] };
  error?: ApiError;
}

export function validateNodeConfigApi(type: string, config: unknown): Promise<NodeConfigValidationResponse> {
  return requestJson<NodeConfigValidationResponse>(`${API_BASE_URL}/api/nodes/validate-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, config }),
  }) as Promise<NodeConfigValidationResponse>;
}
