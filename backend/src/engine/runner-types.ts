import type { ExecutionContext, NodeExecutionError, NodeHandler } from "./execution-types.js";
import type { WorkflowNode, WorkflowEdge } from "./types.js";

/**
 * Lifecycle state of a node during workflow execution.
 */
export type NodeExecutionStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

/**
 * Resolution state of a directed edge during workflow execution.
 */
export type EdgeResolutionStatus =
  | "pending"
  | "active"
  | "skipped"
  | "blocked";

/**
 * Overall workflow run terminal outcome.
 */
export type WorkflowExecutionStatus = "completed" | "failed";

/**
 * Final execution report returned by the graph runner.
 */
export interface WorkflowExecutionSummary {
  readonly executionId: string;
  readonly workflowId: string;
  readonly status: WorkflowExecutionStatus;
  readonly context: ExecutionContext;
  readonly nodeStates: Readonly<Record<string, NodeExecutionStatus>>;
  readonly edgeStates: Readonly<Record<string, EdgeResolutionStatus>>;
  readonly error?: NodeExecutionError;
}

export interface EngineNodeEvent {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly status: NodeExecutionStatus;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: NodeExecutionError;
  readonly branch?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly retryableCodes?: readonly string[];
  readonly backoffMs?: number;
}

/**
 * Options passed to the workflow runner.
 */
export interface ExecuteWorkflowOptions {
  readonly executionId?: string;
  readonly startedAt?: string;
  readonly metadata?: Record<string, unknown>;
  readonly onNodeEvent?: (event: EngineNodeEvent) => Promise<void> | void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Handler map or resolver function providing handlers for nodes.
 */
export type NodeHandlerProvider =
  | Record<string, NodeHandler>
  | ((node: WorkflowNode) => NodeHandler | undefined);

/**
 * Helper to compute a deterministic edge key.
 */
export function getEdgeKey(edge: WorkflowEdge): string {
  return `${edge.source}${edge.sourceHandle ? `#${edge.sourceHandle}` : ""}->${edge.target}`;
}
