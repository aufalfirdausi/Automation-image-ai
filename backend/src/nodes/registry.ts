import type { NodeDefinition, NodeManifest } from "./types.js";
import type { NodeHandler } from "../engine/execution-types.js";
import type { WorkflowNode } from "../engine/types.js";

/**
 * Deterministic node registry governing available node definitions in the backend.
 */
export class NodeRegistry {
  private readonly definitions = new Map<string, NodeDefinition>();

  /**
   * Registers a new node definition.
   * Throws an explicit error if a node with the same type is already registered.
   */
  register(definition: NodeDefinition): void {
    if (!definition || !definition.manifest || !definition.manifest.type) {
      throw new Error("Invalid node definition: manifest.type is required");
    }

    const type = definition.manifest.type.trim();
    if (!type) {
      throw new Error("Invalid node definition: manifest.type cannot be empty");
    }

    if (this.definitions.has(type)) {
      throw new Error(`Duplicate node type registration: '${type}' is already registered`);
    }

    if (!definition.handler || typeof definition.handler.execute !== "function") {
      throw new Error(`Invalid node definition for '${type}': handler.execute must be a function`);
    }

    this.definitions.set(type, definition);
  }

  /**
   * Retrieves the full node definition by type.
   */
  getDefinition(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Retrieves the executable handler for a given node type.
   */
  getHandler(type: string): NodeHandler | undefined {
    return this.definitions.get(type)?.handler;
  }

  /**
   * Retrieves the safe manifest metadata for a given node type.
   */
  getManifest(type: string): NodeManifest | undefined {
    return this.definitions.get(type)?.manifest;
  }

  /**
   * Lists all registered node manifests safely for external/frontend consumption.
   * Strips out any runtime handlers or executable code.
   */
  listManifests(): NodeManifest[] {
    const list: NodeManifest[] = [];
    for (const definition of this.definitions.values()) {
      list.push(definition.manifest);
    }
    return list;
  }

  /**
   * Checks whether a node type is currently registered.
   */
  has(type: string): boolean {
    return this.definitions.has(type);
  }

  /**
   * Clears all registered definitions (useful for isolated unit testing).
   */
  clear(): void {
    this.definitions.clear();
  }

  /**
   * Returns a resolver function compatible with Phase 2 NodeHandlerProvider.
   * Node runner invokes this to resolve handlers for executing nodes.
   */
  toHandlerProvider(): (node: WorkflowNode) => NodeHandler | undefined {
    return (node: WorkflowNode): NodeHandler | undefined => {
      return this.getHandler(node.type);
    };
  }
}

/**
 * Global default registry instance used across the backend application.
 */
export const defaultNodeRegistry = new NodeRegistry();
