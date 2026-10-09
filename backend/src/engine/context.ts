import { randomUUID } from "node:crypto";
import type { ExecutionContext } from "./execution-types.js";

export interface CreateExecutionContextOptions {
  executionId?: string;
  startedAt?: string;
  metadata?: Record<string, unknown>;
  nodeOutputs?: Record<string, unknown>;
}

/**
 * Creates an immutable initial ExecutionContext.
 * Deterministic when executionId and startedAt are provided in options.
 */
export function createExecutionContext(
  workflowId: string,
  options?: CreateExecutionContextOptions
): ExecutionContext {
  const executionId = options?.executionId ?? randomUUID();
  const startedAt = options?.startedAt ?? new Date().toISOString();
  const nodeOutputs = Object.freeze({ ...(options?.nodeOutputs ?? {}) });
  const metadata = options?.metadata ? Object.freeze({ ...options.metadata }) : undefined;

  return Object.freeze({
    executionId,
    workflowId,
    startedAt,
    nodeOutputs,
    metadata,
  });
}

/**
 * Returns a new ExecutionContext with the specified node output recorded.
 * Does not mutate the original context.
 */
export function recordNodeOutput(
  context: ExecutionContext,
  nodeId: string,
  output: unknown
): ExecutionContext {
  return Object.freeze({
    ...context,
    nodeOutputs: Object.freeze({
      ...context.nodeOutputs,
      [nodeId]: output,
    }),
  });
}
