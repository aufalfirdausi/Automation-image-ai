/**
 * Runtime execution state passed across the workflow execution lifecycle.
 * All properties and nested structures are immutable from the node's perspective.
 */
export interface ExecutionContext {
  readonly executionId: string;
  readonly workflowId: string;
  readonly startedAt: string;
  readonly nodeOutputs: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Parameters provided to a node handler during execution.
 */
export interface NodeExecutionParams<
  TConfig = Record<string, unknown>,
  TInput = unknown
> {
  readonly nodeId: string;
  readonly config: TConfig;
  readonly input: TInput;
  readonly context: ExecutionContext;
  /** Signals that the workflow was cancelled or exceeded its execution deadline. */
  readonly signal?: AbortSignal;
}

/**
 * Standardized machine-readable error codes for the workflow execution engine.
 */
export type StandardEngineErrorCode =
  | "INVALID_WORKFLOW"
  | "HANDLER_NOT_FOUND"
  | "NODE_EXECUTION_FAILED"
  | "NODE_EXECUTION_EXCEPTION"
  | "INVALID_HANDLER_RESULT";

/**
 * Standard error structure for node execution failures.
 */
export interface NodeExecutionError {
  readonly message: string;
  readonly code: StandardEngineErrorCode | string;
  readonly details?: unknown;
}

/**
 * Output result produced by a node handler.
 */
export interface NodeExecutionResult<TOutput = unknown> {
  readonly success: boolean;
  readonly output?: TOutput;
  readonly error?: NodeExecutionError;
  readonly branch?: string;
}

/**
 * Executable node handler contract.
 * Always asynchronous, returning a Promise of NodeExecutionResult.
 */
export interface NodeHandler<
  TConfig = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown
> {
  execute(params: NodeExecutionParams<TConfig, TInput>): Promise<NodeExecutionResult<TOutput>>;
}
