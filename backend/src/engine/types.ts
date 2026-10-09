/**
 * Core workflow representation for the execution engine.
 * Kept strictly independent from React Flow and presentation concerns.
 */
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * An individual executable node in the workflow graph.
 */
export interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

/**
 * Directed connection between nodes in a workflow graph.
 */
export interface WorkflowEdge {
  source: string;
  target: string;
  sourceHandle?: string;
}
