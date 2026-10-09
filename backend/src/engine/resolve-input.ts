import type { WorkflowEdge } from "./types.js";
import { type EdgeResolutionStatus, getEdgeKey } from "./runner-types.js";

/**
 * Pure helper to resolve the input payload for an executing node based on resolved active edges.
 *
 * Contract:
 * - Zero incoming edges: returns null
 * - Zero active incoming edges: returns null
 * - Exactly one active incoming edge: returns nodeOutputs[activeEdge.source] directly
 * - Two or more active incoming edges: returns a frozen object { [sourceNodeId]: nodeOutputs[sourceNodeId] }
 * - Only edges with state === "active" contribute input; skipped and blocked edges are excluded
 * - Preserves all values intact without modification (undefined, null, false, 0, "", arrays, objects)
 */
export function resolveNodeInput(
  _nodeId: string,
  incomingEdges: readonly WorkflowEdge[],
  edgeStates: Readonly<Record<string, EdgeResolutionStatus>> | ReadonlyMap<string, EdgeResolutionStatus>,
  nodeOutputs: Readonly<Record<string, unknown>>
): unknown {
  if (!incomingEdges || incomingEdges.length === 0) {
    return null;
  }

  const getStatus = (edge: WorkflowEdge): EdgeResolutionStatus | undefined => {
    const key = getEdgeKey(edge);
    if (
      edgeStates instanceof Map ||
      typeof (edgeStates as unknown as Map<string, EdgeResolutionStatus>).get === "function"
    ) {
      return (edgeStates as ReadonlyMap<string, EdgeResolutionStatus>).get(key);
    }
    return (edgeStates as Readonly<Record<string, EdgeResolutionStatus>>)[key];
  };

  const activeEdges = incomingEdges.filter((edge) => getStatus(edge) === "active");

  if (activeEdges.length === 0) {
    return null;
  }

  if (activeEdges.length === 1) {
    return nodeOutputs[activeEdges[0].source];
  }

  const multiInput: Record<string, unknown> = {};
  for (const edge of activeEdges) {
    multiInput[edge.source] = nodeOutputs[edge.source];
  }

  return Object.freeze(multiInput);
}
