import type { Workflow } from "./types.js";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Pure, deterministic validation for workflow definitions.
 * Enforces DAG acyclicity, node ID uniqueness, and edge referential integrity.
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: string[] = [];

  if (!workflow || typeof workflow !== "object") {
    return {
      isValid: false,
      errors: ["Workflow definition must be an object"],
    };
  }

  // 1. Validate workflow identity
  if (!workflow.id || typeof workflow.id !== "string" || workflow.id.trim() === "") {
    errors.push("Workflow must have a valid non-empty 'id'");
  }

  if (!workflow.name || typeof workflow.name !== "string" || workflow.name.trim() === "") {
    errors.push("Workflow must have a valid non-empty 'name'");
  }

  // 2. Validate nodes array
  if (!Array.isArray(workflow.nodes)) {
    errors.push("Workflow 'nodes' must be an array");
  }

  // 3. Validate edges array
  if (!Array.isArray(workflow.edges)) {
    errors.push("Workflow 'edges' must be an array");
  }

  // Return early if basic container structure is invalid
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
    return { isValid: false, errors };
  }

  // 4. Validate node definitions & unique node IDs
  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();

  for (const node of workflow.nodes) {
    if (!node || typeof node !== "object") {
      errors.push("Each node in workflow must be an object");
      continue;
    }

    if (!node.id || typeof node.id !== "string" || node.id.trim() === "") {
      errors.push("Node must have a valid non-empty 'id'");
    } else {
      if (nodeIds.has(node.id)) {
        duplicateNodeIds.add(node.id);
      }
      nodeIds.add(node.id);
    }

    if (!node.type || typeof node.type !== "string" || node.type.trim() === "") {
      errors.push(`Node '${node.id || "unknown"}' must have a valid non-empty 'type'`);
    }

    if (!node.config || typeof node.config !== "object" || Array.isArray(node.config)) {
      errors.push(`Node '${node.id || "unknown"}' must have a valid 'config' object`);
    }
  }

  for (const dupId of duplicateNodeIds) {
    errors.push(`Duplicate node ID: '${dupId}'`);
  }

  // 5. Validate edges and referential integrity
  const adjacencyList = new Map<string, string[]>();
  for (const id of nodeIds) {
    adjacencyList.set(id, []);
  }

  for (const edge of workflow.edges) {
    if (!edge || typeof edge !== "object") {
      errors.push("Each edge in workflow must be an object");
      continue;
    }

    const { source, target } = edge;
    let validEdge = true;

    if (!source || typeof source !== "string" || source.trim() === "") {
      errors.push("Edge must have a valid non-empty 'source'");
      validEdge = false;
    } else if (!nodeIds.has(source)) {
      errors.push(`Edge source '${source}' references a non-existent node`);
      validEdge = false;
    }

    if (!target || typeof target !== "string" || target.trim() === "") {
      errors.push("Edge must have a valid non-empty 'target'");
      validEdge = false;
    } else if (!nodeIds.has(target)) {
      errors.push(`Edge target '${target}' references a non-existent node`);
      validEdge = false;
    }

    if (validEdge) {
      if (source === target) {
        errors.push(`Self-referencing cycle detected: node '${source}' connects to itself`);
      } else {
        adjacencyList.get(source)?.push(target);
      }
    }
  }

  // 6. DAG Cycle Detection using DFS
  if (duplicateNodeIds.size === 0 && nodeIds.size > 0) {
    // 0 = unvisited, 1 = visiting (in recursion stack), 2 = visited
    const visited = new Map<string, number>();
    for (const id of nodeIds) {
      visited.set(id, 0);
    }

    const currentPath: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.set(nodeId, 1);
      currentPath.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const state = visited.get(neighbor);
        if (state === 1) {
          const cycleStartIndex = currentPath.indexOf(neighbor);
          const cyclePath = currentPath.slice(cycleStartIndex).concat(neighbor);
          errors.push(`Cyclic dependency detected: ${cyclePath.join(" -> ")}`);
          return true;
        }
        if (state === 0) {
          if (dfs(neighbor)) {
            return true;
          }
        }
      }

      currentPath.pop();
      visited.set(nodeId, 2);
      return false;
    };

    for (const id of nodeIds) {
      if (visited.get(id) === 0) {
        if (dfs(id)) {
          break; // Report the detected cycle
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
