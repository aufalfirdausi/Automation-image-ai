import type {
  NodeHandler,
  NodeExecutionParams,
  NodeExecutionResult,
  NodeExecutionError,
} from "./execution-types.js";

/**
 * Safely executes a node handler enforcing Phase 2.7 Error Normalization Rules:
 *
 * A. success: false with error: {...} -> Preserves provided NodeExecutionError. Output discarded.
 * B. success: false without error -> Generates NODE_EXECUTION_FAILED error. Output discarded.
 * C. success: true with output + extraneous error -> Treats success as authoritative, commits output, ignores error.
 * D. success: false with output but no error -> Discards output, generates NODE_EXECUTION_FAILED error.
 * E. Thrown Error -> Normalizes to NODE_EXECUTION_EXCEPTION with error.message and error.stack in details.
 * F. Thrown non-Error -> Normalizes to NODE_EXECUTION_EXCEPTION with String(thrown).
 * G. Invalid return shape (null, undefined, non-object, missing boolean success) -> Normalizes to INVALID_HANDLER_RESULT. Output discarded.
 */
export async function executeNode<
  TConfig = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown
>(
  handler: NodeHandler<TConfig, TInput, TOutput>,
  params: NodeExecutionParams<TConfig, TInput>
): Promise<NodeExecutionResult<TOutput>> {
  try {
    const result = await handler.execute(params);

    if (!result || typeof result !== "object" || typeof result.success !== "boolean") {
      return {
        success: false,
        error: {
          message: "Node handler returned an invalid execution result",
          code: "INVALID_HANDLER_RESULT",
          details: result,
        },
      };
    }

    if (result.success) {
      // Rule C: success === true is authoritative. Commit output, ignore extraneous error property.
      return {
        success: true,
        output: result.output,
        branch: result.branch,
      };
    }

    // Rule A, B, D: success === false. Discard output, preserve or generate error.
    const error: NodeExecutionError = result.error ?? {
      message: `Node '${params.nodeId}' execution failed`,
      code: "NODE_EXECUTION_FAILED",
    };

    return {
      success: false,
      error,
      branch: result.branch,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof Error ? error.stack : undefined;

    return {
      success: false,
      error: {
        message,
        code: "NODE_EXECUTION_EXCEPTION",
        details,
      },
    };
  }
}
