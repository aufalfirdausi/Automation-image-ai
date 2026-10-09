import type { Workflow, WorkflowNode, WorkflowEdge } from "./types.js";
import { validateWorkflow } from "./validate-workflow.js";
import { createExecutionContext, recordNodeOutput } from "./context.js";
import { executeNode } from "./execute-node.js";
import type {
  NodeExecutionParams,
  NodeExecutionError,
  NodeExecutionResult,
  NodeHandler,
  ExecutionContext,
} from "./execution-types.js";
import {
  type NodeExecutionStatus,
  type EdgeResolutionStatus,
  type WorkflowExecutionSummary,
  type ExecuteWorkflowOptions,
  type NodeHandlerProvider,
  type EngineNodeEvent,
  getEdgeKey,
} from "./runner-types.js";
import { resolveNodeInput } from "./resolve-input.js";
import { resolveOutgoingEdgeStates } from "./resolve-edges.js";

/**
 * Executes a validated DAG workflow using deterministic dependency-driven traversal.
 */
export async function executeWorkflow(
  workflow: Workflow,
  handlers: NodeHandlerProvider,
  options?: ExecuteWorkflowOptions
): Promise<WorkflowExecutionSummary> {
  // 1. Validate the workflow before execution
  const validation = validateWorkflow(workflow);
  if (!validation.isValid) {
    const error: NodeExecutionError = {
      message: `Workflow validation failed: ${validation.errors.join("; ")}`,
      code: "INVALID_WORKFLOW",
      details: validation.errors,
    };
    const context = createExecutionContext(workflow?.id || "invalid", options);
    return Object.freeze({
      executionId: context.executionId,
      workflowId: workflow?.id || "invalid",
      status: "failed",
      context,
      nodeStates: Object.freeze({}),
      edgeStates: Object.freeze({}),
      error,
    });
  }

  // 2. Handle empty workflow
  if (workflow.nodes.length === 0) {
    const context = createExecutionContext(workflow.id, options);
    return Object.freeze({
      executionId: context.executionId,
      workflowId: workflow.id,
      status: "completed",
      context,
      nodeStates: Object.freeze({}),
      edgeStates: Object.freeze({}),
    });
  }

  // 3. Initialize execution context & state containers
  let context: ExecutionContext = createExecutionContext(workflow.id, options);
  const nodeStates = new Map<string, NodeExecutionStatus>();
  const edgeStates = new Map<string, EdgeResolutionStatus>();
  const nodesById = new Map<string, WorkflowNode>();
  const incomingEdges = new Map<string, WorkflowEdge[]>();
  const outgoingEdges = new Map<string, WorkflowEdge[]>();

  for (const node of workflow.nodes) {
    nodesById.set(node.id, node);
    nodeStates.set(node.id, "pending");
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of workflow.edges) {
    edgeStates.set(getEdgeKey(edge), "pending");
    incomingEdges.get(edge.target)?.push(edge);
    outgoingEdges.get(edge.source)?.push(edge);
  }

  const readyQueue: string[] = [];

  // Helper: Evaluates if a target node is ready to execute or should be skipped
  function checkTargetNode(targetId: string): void {
    if (nodeStates.get(targetId) !== "pending") {
      return;
    }

    const inEdges = incomingEdges.get(targetId) || [];
    const allResolved = inEdges.every((edge) => edgeStates.get(getEdgeKey(edge)) !== "pending");
    if (!allResolved) {
      return;
    }

    const activeEdges = inEdges.filter((edge) => edgeStates.get(getEdgeKey(edge)) === "active");
    if (activeEdges.length === 0) {
      // All incoming edges are skipped -> cascade skip
      markNodeSkipped(targetId);
    } else {
      // At least one incoming edge is active -> node is ready
      nodeStates.set(targetId, "ready");
      if (!readyQueue.includes(targetId)) {
        readyQueue.push(targetId);
        readyQueue.sort();
      }
    }
  }

  const emitNodeEvent = async (event: EngineNodeEvent): Promise<void> => {
    if (options?.onNodeEvent) {
      try {
        await options.onNodeEvent(event);
      } catch {
        // Safe guardrail: onNodeEvent failures do not abort execution loop
      }
    }
  };

  // Helper: Cascades skip state to a node and its downstream edges
  function markNodeSkipped(nodeId: string): void {
    nodeStates.set(nodeId, "skipped");
    const node = nodesById.get(nodeId);
    void emitNodeEvent({
      nodeId,
      nodeType: node?.type || "unknown",
      status: "skipped",
    });

    const outEdges = outgoingEdges.get(nodeId) || [];
    for (const outEdge of outEdges) {
      const key = getEdgeKey(outEdge);
      if (edgeStates.get(key) === "pending") {
        edgeStates.set(key, "skipped");
        checkTargetNode(outEdge.target);
      }
    }
  }

  // 4. Discover root nodes (in-degree 0)
  for (const node of workflow.nodes) {
    const inEdges = incomingEdges.get(node.id) || [];
    if (inEdges.length === 0) {
      nodeStates.set(node.id, "ready");
      readyQueue.push(node.id);
    }
  }
  readyQueue.sort();

  let workflowFailed = false;
  let workflowError: NodeExecutionError | undefined;

  const workflowAbortController = new AbortController();
  let abortReason: "cancelled" | "timeout" | null = null;

  const abortForCancellation = () => {
    abortReason = "cancelled";
    workflowAbortController.abort();
  };

  if (options?.signal?.aborted) {
    abortForCancellation();
  } else {
    options?.signal?.addEventListener("abort", abortForCancellation, { once: true });
  }

  const timeoutTimer = options?.timeoutMs && options.timeoutMs > 0
    ? setTimeout(() => {
        abortReason = "timeout";
        workflowAbortController.abort();
      }, options.timeoutMs)
    : undefined;

  const getAbortError = (): NodeExecutionError => ({
    message:
      abortReason === "timeout"
        ? `Workflow execution timed out after ${options?.timeoutMs}ms`
        : "Workflow execution cancelled",
    code: abortReason === "timeout" ? "EXECUTION_TIMEOUT" : "EXECUTION_ABORTED",
  });

  async function executeNodeWithAbort(
    handler: NodeHandler,
    params: NodeExecutionParams
  ): Promise<NodeExecutionResult> {
    if (workflowAbortController.signal.aborted) {
      return { success: false as const, error: getAbortError() };
    }

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<NodeExecutionResult>((resolve) => {
      onAbort = () => resolve({ success: false, error: getAbortError() });
      workflowAbortController.signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
      return await Promise.race([executeNode(handler, params), aborted]);
    } finally {
      if (onAbort) {
        workflowAbortController.signal.removeEventListener("abort", onAbort);
      }
    }
  }

  // 5. Sequential deterministic execution loop
  while (readyQueue.length > 0) {
    // Check cooperative cancellation signal
    if (workflowAbortController.signal.aborted) {
      workflowFailed = true;
      workflowError = getAbortError();
      readyQueue.length = 0;
      break;
    }

    const currentNodeId = readyQueue.shift()!;
    const currentNode = nodesById.get(currentNodeId)!;

    // Safeguard: node must be in "ready" state to execute
    if (nodeStates.get(currentNodeId) !== "ready") {
      continue;
    }

    const nodeStartedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    nodeStates.set(currentNodeId, "running");

    // Resolve inputs from incoming active edges
    const inEdges = incomingEdges.get(currentNodeId) || [];
    const nodeInput = resolveNodeInput(
      currentNodeId,
      inEdges,
      edgeStates,
      context.nodeOutputs
    );

    await emitNodeEvent({
      nodeId: currentNodeId,
      nodeType: currentNode.type,
      status: "running",
      input: nodeInput,
      startedAt: nodeStartedAt,
    });

    // Resolve node handler
    const handler =
      typeof handlers === "function"
        ? handlers(currentNode)
        : handlers[currentNode.type] || handlers[currentNode.id];

    if (!handler) {
      const err: NodeExecutionError = {
        message: `No handler registered for node '${currentNode.id}' of type '${currentNode.type}'`,
        code: "HANDLER_NOT_FOUND",
      };
      const nodeFinishedAt = new Date().toISOString();
      nodeStates.set(currentNodeId, "failed");
      workflowFailed = true;
      workflowError = err;

      await emitNodeEvent({
        nodeId: currentNodeId,
        nodeType: currentNode.type,
        status: "failed",
        error: err,
        input: nodeInput,
        startedAt: nodeStartedAt,
        finishedAt: nodeFinishedAt,
        durationMs: Date.now() - startTimeMs,
      });

      // Block outgoing edges
      const outEdges = outgoingEdges.get(currentNodeId) || [];
      for (const outEdge of outEdges) {
        edgeStates.set(getEdgeKey(outEdge), "blocked");
      }

      // Fail-fast: abort remaining queue
      readyQueue.length = 0;
      break;
    }

    const executionParams: NodeExecutionParams = {
      nodeId: currentNode.id,
      config: currentNode.config,
      input: nodeInput,
      context,
      signal: workflowAbortController.signal,
    };

    let result = await executeNodeWithAbort(handler, executionParams);

    // Apply retry policy if configured and execution failed
    if (!result.success && !workflowAbortController.signal.aborted && options?.retryPolicy && options.retryPolicy.maxRetries > 0) {
      const retryableCodes = options.retryPolicy.retryableCodes;
      const errorCode = result.error?.code;
      const isRetryable = !retryableCodes || (errorCode && retryableCodes.includes(errorCode));

      if (isRetryable) {
        for (let attempt = 1; attempt <= options.retryPolicy.maxRetries; attempt++) {
          if (workflowAbortController.signal.aborted) break;
          if (options.retryPolicy.backoffMs && options.retryPolicy.backoffMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, options.retryPolicy!.backoffMs));
          }
          result = await executeNodeWithAbort(handler, executionParams);
          if (result.success) break;
        }
      }
    }

    if (!result.success) {
      const nodeFinishedAt = new Date().toISOString();
      nodeStates.set(currentNodeId, "failed");
      workflowFailed = true;
      workflowError = result.error ?? {
        message: `Node '${currentNode.id}' execution failed`,
        code: "NODE_EXECUTION_FAILED",
      };

      await emitNodeEvent({
        nodeId: currentNodeId,
        nodeType: currentNode.type,
        status: "failed",
        error: workflowError,
        input: nodeInput,
        startedAt: nodeStartedAt,
        finishedAt: nodeFinishedAt,
        durationMs: Date.now() - startTimeMs,
      });

      // Block outgoing edges
      const outEdges = outgoingEdges.get(currentNodeId) || [];
      for (const outEdge of outEdges) {
        edgeStates.set(getEdgeKey(outEdge), "blocked");
      }

      // Fail-fast: clear ready queue immediately
      readyQueue.length = 0;
      break;
    }

    // Node completed successfully
    const nodeFinishedAt = new Date().toISOString();
    nodeStates.set(currentNodeId, "completed");
    context = recordNodeOutput(context, currentNode.id, result.output);

    await emitNodeEvent({
      nodeId: currentNodeId,
      nodeType: currentNode.type,
      status: "completed",
      input: nodeInput,
      output: result.output,
      branch: result.branch,
      startedAt: nodeStartedAt,
      finishedAt: nodeFinishedAt,
      durationMs: Date.now() - startTimeMs,
    });

    // Resolve outgoing edges based on branch output
    const outEdges = outgoingEdges.get(currentNodeId) || [];
    const resolvedEdgeStates = resolveOutgoingEdgeStates(outEdges, result.branch);
    for (const outEdge of outEdges) {
      const key = getEdgeKey(outEdge);
      edgeStates.set(key, resolvedEdgeStates[key]);
      checkTargetNode(outEdge.target);
    }
  }

  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  options?.signal?.removeEventListener("abort", abortForCancellation);

  // 6. Assemble frozen summary
  const finalNodeStates: Record<string, NodeExecutionStatus> = {};
  for (const [nodeId, status] of nodeStates.entries()) {
    finalNodeStates[nodeId] = status;
  }

  const finalEdgeStates: Record<string, EdgeResolutionStatus> = {};
  for (const [edgeKey, status] of edgeStates.entries()) {
    finalEdgeStates[edgeKey] = status;
  }

  return Object.freeze({
    executionId: context.executionId,
    workflowId: workflow.id,
    status: workflowFailed ? "failed" : "completed",
    context,
    nodeStates: Object.freeze(finalNodeStates),
    edgeStates: Object.freeze(finalEdgeStates),
    error: workflowError,
  });
}
