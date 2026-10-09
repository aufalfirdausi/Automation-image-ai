import type { Node, Edge } from "@xyflow/react";

/**
 * Node data payload stored in React Flow nodes.
 * Contains metadata for UI presentation and engine configuration.
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
  status?: "idle" | "running" | "completed" | "failed" | "skipped";
  hasError?: boolean;
  errorMessages?: string[];
}

/**
 * High-level categorization for nodes in the editor palette.
 */
export type NodeCategory = "trigger" | "action" | "logic" | "utility" | "ai" | "tools" | string;

/**
 * Port descriptor for inputs and outputs in node manifest.
 */
export interface NodePortMetadata {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
  readonly description?: string;
}

/**
 * Metadata descriptor for configurable fields on a node.
 */
export interface NodeConfigFieldMetadata {
  readonly name: string;
  readonly label: string;
  readonly type: "string" | "number" | "boolean" | "select" | "json";
  readonly defaultValue?: unknown;
  readonly required?: boolean;
  readonly description?: string;
  readonly options?: Array<{ label: string; value: string | number }>;
}

/**
 * Safe, serializable node manifest contract consumed from GET /api/nodes.
 */
export interface NodeManifest {
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly category: NodeCategory;
  readonly icon?: string;
  readonly inputs: readonly NodePortMetadata[];
  readonly outputs: readonly NodePortMetadata[];
  readonly configFields: readonly NodeConfigFieldMetadata[];
}


/**
 * Typed React Flow node specialized for the visual workflow editor.
 */
export type CanvasNode = Node<WorkflowNodeData>;

/**
 * Typed React Flow edge for connections between workflow nodes.
 */
export type CanvasEdge = Edge;

/**
 * Pure Phase 2 engine workflow representation.
 * Kept aligned with backend/src/engine/types.ts.
 */
export interface EngineWorkflow {
  id: string;
  name: string;
  nodes: EngineWorkflowNode[];
  edges: EngineWorkflowEdge[];
}

export interface EngineWorkflowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface EngineWorkflowEdge {
  source: string;
  target: string;
  sourceHandle?: string;
}

/**
 * Visual workflow representation with layout coordinates preserved.
 */
export interface VisualWorkflow extends EngineWorkflow {
  visualMetadata?: {
    positions?: Record<string, { x: number; y: number }>;
  };
}
