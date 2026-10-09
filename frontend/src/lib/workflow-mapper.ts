import type {
  CanvasNode,
  CanvasEdge,
  EngineWorkflow,
  EngineWorkflowNode,
  EngineWorkflowEdge,
  VisualWorkflow,
  NodeManifest,
} from "../types/workflow-flow";

/**
 * Pure mapper: Transforms visual React Flow canvas nodes and edges
 * into a Phase 2 compliant VisualWorkflow representation.
 *
 * Rules:
 * - Preserves spatial coordinates in `visualMetadata.positions`.
 * - Extracts `node.data.nodeType` -> `node.type`.
 * - Extracts `node.data.config` -> `node.config`.
 * - Normalizes `sourceHandle`: `null`, `""`, or `"default"` -> `undefined`.
 * - Preserves named branch handles intact (e.g. `"true"`, `"false"`).
 */
export function flowToWorkflow(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  metadata?: { id?: string; name?: string }
): VisualWorkflow {
  const engineNodes: EngineWorkflowNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType || "default",
    config: node.data.config || {},
  }));

  const engineEdges: EngineWorkflowEdge[] = edges.map((edge) => {
    let normalizedHandle: string | undefined = undefined;
    if (
      edge.sourceHandle &&
      edge.sourceHandle !== "" &&
      edge.sourceHandle !== "default"
    ) {
      normalizedHandle = edge.sourceHandle;
    }

    const engineEdge: EngineWorkflowEdge = {
      source: edge.source,
      target: edge.target,
    };

    if (normalizedHandle !== undefined) {
      engineEdge.sourceHandle = normalizedHandle;
    }

    return engineEdge;
  });

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    if (node.position) {
      positions[node.id] = {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      };
    }
  }

  return {
    id: metadata?.id || "workflow_draft",
    name: metadata?.name || "Untitled Workflow",
    nodes: engineNodes,
    edges: engineEdges,
    visualMetadata: {
      positions,
    },
  };
}

/**
 * Pure mapper: Deserializes a Phase 2 EngineWorkflow or VisualWorkflow
 * into React Flow visual nodes and edges.
 *
 * Rules:
 * - Uses cached/saved coordinates if available, otherwise computes a simple deterministic layout.
 * - Wraps `type` and `config` in `node.data`.
 * - Formats deterministic edge IDs: `${source}${sourceHandle ? `#${sourceHandle}` : ""}->${target}`.
 */
export function workflowToFlow(
  workflow: VisualWorkflow | EngineWorkflow,
  fallbackLayout?: Record<string, { x: number; y: number }>,
  manifests?: readonly NodeManifest[]
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const positions =
    ("visualMetadata" in workflow && workflow.visualMetadata?.positions) ||
    fallbackLayout ||
    {};

  const canvasNodes: CanvasNode[] = workflow.nodes.map((node, index) => {
    const savedPos = positions[node.id];
    const defaultX = 100 + (index % 4) * 260;
    const defaultY = 100 + Math.floor(index / 4) * 160;

    const manifest = manifests?.find((m) => m.type === node.type);
    const isTrigger =
      node.type === "manual_trigger" ||
      node.type.endsWith("_trigger") ||
      manifest?.category === "trigger" ||
      (manifest ? manifest.inputs.length === 0 : false);
    const isCondition =
      node.type === "condition" ||
      node.type === "condition_branch" ||
      (manifest ? manifest.outputs.some((o) => o.id === "true" || o.id === "false") : false);

    const shellType = isCondition
      ? "conditionNode"
      : isTrigger
      ? "triggerNode"
      : "actionNode";

    return {
      id: node.id,
      type: shellType,
      position: savedPos || { x: defaultX, y: defaultY },
      data: {
        label: node.id,
        nodeType: node.type,
        config: node.config || {},
        status: "idle",
      },
    };
  });

  const canvasEdges: CanvasEdge[] = workflow.edges.map((edge) => {
    const handleStr = edge.sourceHandle ? `#${edge.sourceHandle}` : "";
    const edgeId = `${edge.source}${handleStr}->${edge.target}`;

    return {
      id: edgeId,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      animated: true,
    };
  });

  return { nodes: canvasNodes, edges: canvasEdges };
}
