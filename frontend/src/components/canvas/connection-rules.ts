import type { Connection, Edge } from "@xyflow/react";

/**
 * Validates a pending edge connection on the React Flow canvas.
 *
 * Rules:
 * 1. Self-loops are strictly prohibited (source === target).
 * 2. Duplicate connections sharing identical (source, sourceHandle, target) are rejected.
 */
export function isValidCanvasConnection(
  connection: Connection,
  existingEdges: readonly Edge[]
): boolean {
  if (!connection.source || !connection.target) {
    return false;
  }

  // 1. Prohibit self-loops
  if (connection.source === connection.target) {
    return false;
  }

  // 2. Prohibit duplicate edges
  const sourceHandle = connection.sourceHandle || null;
  const isDuplicate = existingEdges.some((edge) => {
    const existingHandle = edge.sourceHandle || null;
    return (
      edge.source === connection.source &&
      edge.target === connection.target &&
      existingHandle === sourceHandle
    );
  });

  if (isDuplicate) {
    return false;
  }

  return true;
}
