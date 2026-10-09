"use client";

import React, { useCallback, useId, useState, useEffect, useImperativeHandle, forwardRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { workflowNodeTypes } from "./nodes/node-types";
import { isValidCanvasConnection } from "./connection-rules";
import type { CanvasNode, CanvasEdge, NodeManifest } from "../../types/workflow-flow";

export interface WorkflowCanvasRef {
  updateNodeConfig: (nodeId: string, newConfig: Record<string, unknown>) => void;
}

export interface WorkflowCanvasProps {
  initialNodes?: CanvasNode[];
  initialEdges?: CanvasEdge[];
  manifests?: NodeManifest[];
  nodeStatusMap?: Record<string, "idle" | "running" | "completed" | "failed" | "skipped">;
  onGraphChange?: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onNodeSelect?: (node: CanvasNode | null) => void;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(function WorkflowCanvas(
  {
    initialNodes = [],
    initialEdges = [],
    manifests = [],
    nodeStatusMap,
    onGraphChange,
    onNodeSelect,
  },
  ref
) {
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges);
  const reactId = useId().replace(/:/g, "");

  // Group manifests by category (trigger, utility, logic, ai, tools, etc.)
  const groupedManifests = React.useMemo(() => {
    const PREFERRED_CATEGORIES = ["trigger", "utility", "logic", "ai", "tools"];
    const groups: Record<string, NodeManifest[]> = {};
    for (const cat of PREFERRED_CATEGORIES) {
      groups[cat] = [];
    }
    for (const m of manifests) {
      const cat = m.category || "utility";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(m);
    }
    return groups;
  }, [manifests]);

  // Update node statuses when nodeStatusMap changes
  useEffect(() => {
    if (!nodeStatusMap) return;
    setNodes((currentNodes) =>
      currentNodes.map((n) => {
        const nextStatus = nodeStatusMap[n.id];
        if (nextStatus && n.data.status !== nextStatus) {
          return {
            ...n,
            data: {
              ...n.data,
              status: nextStatus,
            },
          };
        }
        return n;
      })
    );
  }, [nodeStatusMap]);

  // Notify parent on change
  const notifyChange = useCallback(
    (updatedNodes: CanvasNode[], updatedEdges: CanvasEdge[]) => {
      if (onGraphChange) {
        onGraphChange(updatedNodes, updatedEdges);
      }
    },
    [onGraphChange]
  );

  // Handle node changes (position, delete, select, etc.)
  const handleNodesChange: OnNodesChange<CanvasNode> = useCallback(
    (changes) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      setNodes(nextNodes);
      const isSignificant = changes.some(
        (c) => c.type === "remove" || c.type === "add" || (c.type === "position" && !c.dragging)
      );
      if (isSignificant) {
        notifyChange(nextNodes, edges);
      }
    },
    [nodes, edges, notifyChange]
  );

  // Handle edge changes (remove, select, etc.)
  const handleEdgesChange: OnEdgesChange<CanvasEdge> = useCallback(
    (changes) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      setEdges(nextEdges);
      const isSignificant = changes.some((c) => c.type === "remove" || c.type === "add");
      if (isSignificant) {
        notifyChange(nodes, nextEdges);
      }
    },
    [nodes, edges, notifyChange]
  );

  // Handle new connection with connection rules
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!isValidCanvasConnection(connection, edges)) {
        return;
      }
      const nextEdges = addEdge({ ...connection, animated: true }, edges);
      setEdges(nextEdges);
      notifyChange(nodes, nextEdges);
    },
    [edges, nodes, notifyChange]
  );

  // Add Node helper
  const addNode = useCallback(
    (nodeType: string, manifest?: NodeManifest) => {
      const resolvedManifest = manifest || manifests.find((m) => m.type === nodeType);

      let typeKey: "triggerNode" | "conditionNode" | "actionNode" = "actionNode";
      if (
        nodeType === "manual_trigger" ||
        nodeType.endsWith("_trigger") ||
        resolvedManifest?.category === "trigger" ||
        (resolvedManifest && resolvedManifest.inputs.length === 0)
      ) {
        typeKey = "triggerNode";
      } else if (
        nodeType === "condition" ||
        nodeType === "condition_branch" ||
        (resolvedManifest && resolvedManifest.outputs.some((o) => o.id === "true" || o.id === "false"))
      ) {
        typeKey = "conditionNode";
      } else {
        typeKey = "actionNode";
      }

      const defaultConfig: Record<string, unknown> = {};
      if (resolvedManifest?.configFields) {
        for (const field of resolvedManifest.configFields) {
          if (field.defaultValue !== undefined) {
            defaultConfig[field.name] = field.defaultValue;
          }
        }
      }

      const uniqueSuffix = `${reactId}_${Date.now().toString(36).slice(-4)}`;
      const newNodeId = `${nodeType}_${uniqueSuffix}`;

      const newNode: CanvasNode = {
        id: newNodeId,
        type: typeKey,
        position: {
          x: 150 + (nodes.length % 5) * 50,
          y: 150 + (nodes.length % 5) * 50,
        },
        data: {
          label: newNodeId,
          nodeType,
          config: defaultConfig,
          status: "idle",
        },
      };

      const nextNodes = nodes.concat(newNode);
      setNodes(nextNodes);
      notifyChange(nextNodes, edges);
    },
    [nodes, edges, notifyChange, reactId, manifests]
  );

  // Expose imperative handle for config updates
  useImperativeHandle(
    ref,
    () => ({
      updateNodeConfig: (nodeId: string, newConfig: Record<string, unknown>) => {
        setNodes((currentNodes) => {
          const nextNodes = currentNodes.map((n) => {
            if (n.id === nodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: newConfig,
                },
              };
            }
            return n;
          });
          notifyChange(nextNodes, edges);
          return nextNodes;
        });
      },
    }),
    [edges, notifyChange]
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Top Toolbar */}
      <div
        style={{
          padding: "12px 20px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
          Add Node:
        </span>
        <button
          onClick={() => addNode("manual_trigger")}
          className="btn-primary"
          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
        >
          + Trigger
        </button>
        <button
          onClick={() => addNode("action")}
          className="btn-primary"
          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
        >
          + Action
        </button>
        <button
          onClick={() => addNode("condition")}
          className="btn-primary"
          style={{ padding: "6px 12px", fontSize: "0.85rem" }}
        >
          + Condition (Branch)
        </button>

        {/* More Nodes Dropdown */}
        <select
          aria-label="More Nodes"
          defaultValue=""
          onChange={(e) => {
            const selectedType = e.target.value;
            if (!selectedType) return;
            const selectedManifest = manifests.find((m) => m.type === selectedType);
            if (selectedManifest) {
              addNode(selectedManifest.type, selectedManifest);
            }
            e.target.value = "";
          }}
          style={{
            padding: "6px 12px",
            fontSize: "0.85rem",
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <option value="" disabled>
            + More Nodes...
          </option>
          {Object.entries(groupedManifests).map(([category, items]) => {
            if (items.length === 0) return null;
            return (
              <optgroup key={category} label={category.toUpperCase()}>
                {items.map((m) => (
                  <option key={m.type} value={m.type}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* React Flow Area */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={workflowNodeTypes}
          onNodeClick={(_evt, node) => onNodeSelect && onNodeSelect(node)}
          onPaneClick={() => onNodeSelect && onNodeSelect(null)}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
          <Controls />
          <MiniMap
            nodeColor={() => "var(--accent-blue)"}
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
});

WorkflowCanvas.displayName = "WorkflowCanvas";
