import type { RunStatus } from "./types.js";

export class InvalidRunStatusTransitionError extends Error {
  readonly fromStatus: RunStatus;
  readonly toStatus: RunStatus;
  readonly code = "INVALID_STATUS_TRANSITION";

  constructor(fromStatus: RunStatus, toStatus: RunStatus) {
    super(`Invalid run status transition from '${fromStatus}' to '${toStatus}'`);
    this.name = "InvalidRunStatusTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

/**
 * Valid state transition graph for workflow runs.
 */
const VALID_TRANSITIONS: Readonly<Record<RunStatus, ReadonlySet<RunStatus>>> = {
  requested: new Set<RunStatus>(["running", "failed"]),
  running: new Set<RunStatus>(["succeeded", "failed", "cancelled"]),
  succeeded: new Set<RunStatus>(),
  failed: new Set<RunStatus>(),
  cancelled: new Set<RunStatus>(),
};

/**
 * Checks if a status transition is permitted.
 */
export function isValidRunTransition(from: RunStatus, to: RunStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

/**
 * Throws InvalidRunStatusTransitionError if the transition is prohibited.
 */
export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!isValidRunTransition(from, to)) {
    throw new InvalidRunStatusTransitionError(from, to);
  }
}

/**
 * Returns true if the status represents a final terminal outcome.
 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
