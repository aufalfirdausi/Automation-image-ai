# Execution System Specification (Phase 5)

## 1. Architectural Role & Execution Boundaries

- **Single Source of Truth**: The Node.js / TypeScript / Express backend engine is the authoritative source for workflow validation, execution order, state transitions, output recording, and error propagation.
- **Frontend Boundary**: The Next.js + React Flow frontend serves strictly as a visual presentation, authoring, and monitoring client. It does not calculate DAG topology, execute handlers, or evaluate transition states.
- **Database Boundary**: Execution runs and run events are persisted to MySQL with immutable snapshots (`workflow_snapshot`), protecting historic execution records against future workflow edits.

---

## 2. Run State Machine Lifecycle

```
[requested]
    │
    ├───────────► [failed] (if pre-execution validation gates fail)
    ▼
[running]
    │
    ├───────────► [succeeded] (all active nodes complete)
    ├───────────► [failed]    (node error, fail-fast, timeout)
    └───────────► [cancelled] (aborted via AbortSignal)
```

Terminal states (`succeeded`, `failed`, `cancelled`) are immutable. Attempting any transition from a terminal state throws `InvalidRunStatusTransitionError`.

---

## 3. Reliability, Timeouts & Cancellation Semantics

### Timeout Handling (`timeoutMs`)
- Workflows support an optional execution timeout via `ExecuteWorkflowOptions.timeoutMs`.
- The sequential execution loop checks elapsed time before dispatching each node.
- If the execution duration exceeds `timeoutMs`, the runner terminates immediately with `code: "EXECUTION_TIMEOUT"`.
- Remaining ready nodes are skipped and the run status transitions to `failed`.

### Cancellation Semantics (`AbortSignal`)
- Cooperative cancellation is supported through standard `AbortSignal`.
- Prior to executing each ready node, the runner verifies `signal.aborted`.
- If aborted, execution ceases immediately, and the run transitions to `cancelled` with `code: "EXECUTION_ABORTED"`.

### Retry Boundary (`RetryPolicy`)
- Retries are bounded and configured via `RetryPolicy`:
  - `maxRetries`: Maximum retry attempts per node.
  - `retryableCodes`: Specific error codes eligible for retry (e.g. `TRANSIENT_NETWORK_ERR`).
  - `backoffMs`: Backoff interval between retry attempts.
- Non-idempotent side effects must not be retried unless explicitly designated retryable.

---

## 4. Failure Recovery Matrix

| Failure Mode | Trigger / Condition | System Behavior | Run Status | Error Code |
| :--- | :--- | :--- | :--- | :--- |
| **Missing Workflow** | Invalid `workflowId` provided | Rejects request at Pre-execution Gate A | - (HTTP 404) | `WORKFLOW_NOT_FOUND` |
| **Invalid DAG Cycle** | Graph contains cycle or missing edge refs | Rejects at Pre-execution Gate B | - (HTTP 400) | `INVALID_WORKFLOW` |
| **Unregistered Node** | Node type absent from `NodeRegistry` | Rejects at Pre-execution Gate C | - (HTTP 400) | `HANDLER_NOT_FOUND` |
| **Invalid Node Config** | Config fails schema validation | Rejects at Pre-execution Gate D | - (HTTP 400) | `INVALID_NODE_CONFIG` |
| **Handler Failure** | Node handler returns `success: false` | Fail-fast: blocks outgoing edges, aborts queue | `failed` | Preserved or `NODE_EXECUTION_FAILED` |
| **Unhandled Exception** | Handler throws unexpected error | Normalized by `executeNode` wrapper | `failed` | `NODE_EXECUTION_EXCEPTION` |
| **Execution Timeout** | Elapsed time exceeds `timeoutMs` | Aborts remaining queue | `failed` | `EXECUTION_TIMEOUT` |
| **Cooperative Abort** | `AbortSignal` triggered | Halts execution loop cleanly | `cancelled` | `EXECUTION_ABORTED` |
| **Event Logging Error** | Database error writing event log | Guardrail: logs warning, does not break execution | Preserved | - |

---

## 5. Security & Observability Protections

1. **Payload Redaction**: Secrets matching pattern `/token|secret|password|apikey|authorization|credential/i` are redacted to `"[REDACTED]"`.
2. **Size Limits**: Strings exceeding 32 KB are truncated with size indicators; arrays exceeding 100 items are truncated.
3. **Circular Reference Protection**: A `WeakSet` tracks visited object references during serialization to prevent call-stack overflow.
