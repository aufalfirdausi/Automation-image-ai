import type { WorkflowEdge } from "./types.js";
import { type EdgeResolutionStatus, getEdgeKey } from "./runner-types.js";

/**
 * Pure helper to resolve outgoing edge resolution states ("active" | "skipped")
 * based on node execution branch output.
 *
 * Approved rules:
 * 1. WorkflowEdge.sourceHandle:
 *    - undefined = default edge
 *    - "" = default edge
 *    - "default" = default edge
 *    - any other non-empty string = named branch handle
 *
 * 2. NodeExecutionResult.branch:
 *    - undefined = no branch selected; activate default edges
 *    - non-empty string = activate only edges with exactly matching sourceHandle
 *    - empty string "" = invalid/unknown branch; activate NO outgoing edges
 *
 * 3. When branch === undefined:
 *    - sourceHandle undefined -> active
 *    - sourceHandle "" -> active
 *    - sourceHandle "default" -> active
 *    - all named non-default handles -> skipped
 *
 * 4. When branch is a non-empty string:
 *    - sourceHandle === branch -> active
 *    - every other outgoing edge -> skipped
 *    - default edges must NOT fall through
 *
 * 5. When branch is unknown and no matching handle exists:
 *    - all outgoing edges -> skipped
 *    - no default fallback
 *
 * 6. Multiple outgoing edges with the same selected sourceHandle:
 *    - all become active
 */
export function resolveOutgoingEdgeStates(
  outgoingEdges: readonly WorkflowEdge[],
  branch?: string
): Readonly<Record<string, EdgeResolutionStatus>> {
  const result: Record<string, EdgeResolutionStatus> = {};

  if (!outgoingEdges || outgoingEdges.length === 0) {
    return Object.freeze(result);
  }

  const isDefaultEdge = (edge: WorkflowEdge): boolean => {
    return !edge.sourceHandle || edge.sourceHandle === "" || edge.sourceHandle === "default";
  };

  for (const edge of outgoingEdges) {
    const key = getEdgeKey(edge);

    if (branch === undefined) {
      // No branch specified: activate all default edges, skip named handles
      result[key] = isDefaultEdge(edge) ? "active" : "skipped";
    } else if (branch === "") {
      // Empty string branch: invalid/unknown branch, activate no outgoing edges
      result[key] = "skipped";
    } else {
      // Non-empty string branch: activate only exact handle match, skip everything else
      result[key] = edge.sourceHandle === branch ? "active" : "skipped";
    }
  }

  return Object.freeze(result);
}
