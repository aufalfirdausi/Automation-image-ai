---
name: frontend-engineer
description: >-
  Standards for frontend development with Next.js, React, TypeScript, and React Flow.
  Use when creating or modifying UI components, node-based canvas graphs, state
  management, and backend API integrations.
---

# Frontend Engineer Skill

## Purpose

This skill establishes the frontend architecture, component patterns, and UI standards for the **Orchestrator** application, built using **Next.js**, **React**, **TypeScript**, and **React Flow**.

---

## 1. Stack & Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      Next.js App / Pages                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Workflow Builder Page                               │   │
│   │   ├── Canvas Area (React Flow Provider)             │   │
│   │   │     ├── Custom Nodes (Trigger, Gemini, DB, IF)  │   │
│   │   │     ├── Custom Edges & Handles                  │   │
│   │   │     └── MiniMap, Controls, Background           │   │
│   │   ├── Node Config Sidebar / Inspector               │   │
│   │   └── Execution Status & Logs Drawer                │   │
│   └─────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ State Management & API Client                       │   │
│   │   • Graph state (nodes, edges, selection)           │   │
│   │   • Async mutations (Save, Run, Fetch Logs)         │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. React Flow Integration Standards

1. **Custom Node Components**:
   - Register custom nodes in a dedicated `nodeTypes` map outside component render cycles to prevent re-creation.
   - Each node type (e.g., `TriggerNode`, `GeminiNode`, `ConditionNode`, `DatabaseNode`) must clearly display:
     - Node title and icon.
     - Status indicator (Idle, Running, Success, Failed).
     - Connected source and target `<Handle />` components.
2. **Controlled Graph State**:
   - Maintain `nodes` and `edges` state using `useNodesState` and `useEdgesState` hooks or a dedicated state slice.
   - Sync changes back to the backend only on intentional save actions or debounced updates.
3. **Graph Serialization / Deserialization**:
   - Persist node coordinates, dimensions, types, and node configuration payloads cleanly into JSON structures matching backend schemas.

---

## 3. Component & State Management Guidelines

* **Component Decomposition**:
  - Keep components modular and single-purpose (e.g. separate the React Flow canvas from the node property editor panel).
  - Avoid monster components with hundreds of lines of mixed canvas and configuration logic.
* **State Management**:
  - Keep state as local as possible. Lift state up only when multiple panels require access (e.g., currently selected node ID).
  - Avoid duplicate state synchronization between local state and React Flow node internal data.
* **TypeScript Types**:
  - Strongly type all node data interfaces:
    ```ts
    export interface WorkflowNodeData {
      label: string;
      config: Record<string, unknown>;
      status?: "idle" | "running" | "success" | "failed";
    }
    ```

---

## 4. API Integration & UX

* **Loading & Error States**:
  - Every asynchronous operation (fetching workflow, triggering execution, saving graph) must provide visible loading indicators and human-friendly error messages.
* **Optimistic Updates vs Rollbacks**:
  - Handle failed network requests gracefully; notify the user with toast/banner alerts without breaking canvas interaction.
* **Clean Code in UI**:
  - Remove all debugging `console.log` statements before finalizing changes.
  - Never leave hardcoded backend API URLs; use environment variables or centralized API client instances.
