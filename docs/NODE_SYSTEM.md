# Node System Architecture & Specification

## 1. Overview & Architectural Boundaries

The **Node System** provides an extensible, safe, and typed mechanism for defining, registering, validating, and executing workflow nodes within the **Orchestrator Local** platform.

### Core Architectural Principles:
1. **Backend as the Single Source of Truth**:
   - The backend defines node schemas (`NodeManifest`), validates input configurations (`validateNodeConfig`), and executes node handlers (`NodeHandler`).
   - The frontend visual editor (React Flow) serves **only** as an authoring layer. It queries node metadata via `GET /api/nodes` and submits configurations to `POST /api/nodes/validate-config`.
   - The frontend **never** executes node handlers, evaluates logic, or determines graph semantics.
2. **Deterministic & Pure Execution**:
   - Node handlers are stateless functions accepting `{ config, input, context }` and returning `{ success: boolean, output?: unknown, error?: NodeExecutionError, branch?: string }`.
   - No implicit state is shared across node invocations; data passes strictly through directed edges and execution context.
3. **No Arbitrary Code Execution**:
   - `eval()`, `new Function()`, or dynamic scripting inside node definitions is strictly prohibited.
4. **Fail-Fast Error Handling**:
   - Execution failure immediately halts downstream processing in the DAG according to Phase 2 engine invariants.

---

## 2. Node Manifest Specification

A `NodeManifest` describes the visual, structural, and configuration requirements for a node type.

```typescript
export interface NodePortMetadata {
  id: string;             // Unique identifier for handle within the node (e.g. "main", "true", "false")
  label: string;          // Human-readable port label
  description?: string;
  dataType?: "string" | "number" | "boolean" | "object" | "array" | "any";
}

export interface NodeConfigFieldMetadata {
  name: string;           // Key in node.config object
  label: string;          // Display label in editor form
  type: "string" | "number" | "boolean" | "select" | "json";
  required?: boolean;     // Whether field must be populated
  defaultValue?: unknown; // Initial value on node placement
  description?: string;
  options?: Array<{ label: string; value: string | number }>; // For "select" fields
}

export interface NodeManifest {
  type: string;           // Unique snake_case string identifier
  name: string;           // Human-readable title
  version: string;        // Semver string (e.g. "1.0.0")
  description: string;
  category: "trigger" | "utility" | "ai" | "data" | "logic";
  inputs: NodePortMetadata[];
  outputs: NodePortMetadata[];
  configFields: NodeConfigFieldMetadata[];
}
```

---

## 3. Node Execution Contract

Every node must implement the `NodeHandler` interface:

```typescript
export interface NodeHandlerParams<TConfig = Record<string, unknown>, TInput = unknown> {
  config: TConfig;
  input: TInput;
  context: Readonly<ExecutionContext>;
}

export interface NodeHandler<TConfig = Record<string, unknown>, TInput = unknown, TOutput = unknown> {
  execute(params: NodeHandlerParams<TConfig, TInput>): Promise<NodeExecutionResult<TOutput>>;
}
```

### Response Guarantees:
- **Success**: Return `{ success: true, output: TOutput, branch?: string }`.
- **Branching (Conditional Nodes)**: Provide `branch` matching an `id` in `outputs` (e.g. `"true"` or `"false"`). The engine will prune non-matching outgoing branches as `skipped`.
- **Explicit Failure**: Return `{ success: false, error: { message: string, code?: StandardEngineErrorCode } }`.
- **Exception Normalization**: If `execute()` throws an unhandled exception, the engine automatically catches and normalizes it into `NODE_EXECUTION_EXCEPTION`.

---

## 4. Node Registry

The backend registry (`NodeRegistry`) manages registered nodes:

```typescript
const registry = new NodeRegistry();

// 1. Register a definition (throws on duplicate type)
registry.register(myNodeDefinition);

// 2. Lookup definition
const node = registry.get("my_node_type");

// 3. List safe manifests for frontend (excludes handler closures)
const manifests = registry.listManifests();

// 4. Adapt to Phase 2 NodeHandlerProvider for DAG execution
const handlerProvider = registry.toHandlerProvider();
```

---

## 5. Core Utility Nodes (Phase 4.3)

Four standard utility nodes are bundled with the backend:

| Node Type | Category | Inputs | Outputs | Description |
|---|---|---|---|---|
| `passthrough` | `utility` | `["main"]` | `["main"]` | Passes predecessor output to downstream nodes unchanged. |
| `static_value` | `utility` | `[]` | `["main"]` | Emits a configured string value. Useful as static input roots. |
| `text_transform` | `utility` | `["text"]` | `["text"]` | Performs safe string operations: `uppercase`, `lowercase`, or `trim`. |
| `condition_branch` | `logic` | `["input"]` | `["true", "false"]` | Evaluates condition (`truthy`, `equals`, `not_equals`) and routes execution to active branch handle. |

---

## 6. How to Author a New Node

To add a new node:

1. Create a file under `backend/src/nodes/` (or a dedicated subdirectory).
2. Define the `NodeDefinition` with typed config, input, and output schemas:
   ```typescript
   import type { NodeDefinition } from "./types.js";

   export const myCustomNode: NodeDefinition<{ prefix: string }, string, string> = {
     manifest: {
       type: "my_custom_node",
       name: "My Custom Node",
       version: "1.0.0",
       description: "Prepends a prefix to text input.",
       category: "utility",
       inputs: [{ id: "main", label: "Input" }],
       outputs: [{ id: "main", label: "Output" }],
       configFields: [
         { name: "prefix", label: "Prefix", type: "string", required: true, defaultValue: "[INFO] " }
       ],
     },
     handler: {
       async execute({ config, input }) {
         return {
           success: true,
           output: `${config.prefix}${String(input ?? "")}`,
         };
       },
     },
   };
   ```
3. Register the definition during startup in `backend/src/server.ts` or `registerCoreNodes()`.
4. Add contract and unit tests in `backend/test/`.

---

## 7. Versioning & Deprecation Policy

- All `version` strings must adhere to Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Patch (`1.0.x`)**: Bug fixes or performance improvements inside `execute()` without manifest changes.
- **Minor (`1.x.0`)**: Adding optional configuration fields or optional ports without breaking existing workflows.
- **Major (`x.0.0`)**: Modifying existing required config fields, removing/renaming port IDs, or altering output data contracts.
- **Deprecation**: Deprecated nodes should set `description` with a deprecation notice and be retained until the next major release of the platform.
