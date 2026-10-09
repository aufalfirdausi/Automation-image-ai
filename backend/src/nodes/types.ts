import type { NodeHandler } from "../engine/execution-types.js";

/**
 * High-level categorization for nodes in the editor palette.
 */
export type NodeCategory = "trigger" | "action" | "logic" | "utility" | "ai";

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
 * Safe, serializable metadata exposed to the frontend editor.
 * Must NOT contain handlers, source code, internal dependencies, or credentials.
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
 * Complete node definition kept strictly on the backend.
 * Couples safe manifest metadata with the executable NodeHandler.
 */
export interface NodeDefinition<
  TConfig = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown
> {
  readonly manifest: NodeManifest;
  readonly handler: NodeHandler<TConfig, TInput, TOutput>;
}
