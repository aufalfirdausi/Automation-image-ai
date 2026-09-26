---
name: testing-and-quality
description: >-
  Standards for unit, integration, API, and workflow execution testing.
  Use when writing test suites, verifying graph execution states, testing failure
  cascades, validating edge conditions, and executing regression checks.
---

# Testing & Quality Skill

## Purpose

This skill defines the testing hierarchy, test coverage expectations, and verification protocols for the **Orchestrator** platform. It provides explicit guidelines for testing workflow pipelines, mock boundaries, and edge condition failures.

---

## 1. Testing Pyramid & Categories

```text
               ▲
              / \
             /E2E\       Workflow Execution Tests (Full Graph Lifecycle)
            /-----\
           / Integ \     API Endpoints, MySQL Transactions, Provider Mocks
          /---------\
         /   Unit    \   DAG Topological Sort, Condition Logic, Input Resolvers
        /─────────────\
```

* **Unit Testing**: Tests isolated, deterministic logic (e.g. DAG cycle detection, condition expression parsing, schema validation) without database or network I/O.
* **Integration Testing**: Verifies controller-to-service communication, database queries against a test MySQL instance, and error middleware handling.
* **Workflow Execution Testing**: Tests sequential and branching execution across real or mocked nodes.
* **Regression Testing**: Ensures that bug fixes include test cases preventing the bug from recurring.

---

## 2. Canonical Workflow Test Scenarios

Every workflow engine modification must be validated against both positive and negative execution paths.

### Scenario A: Happy Path Execution

```text
Manual Trigger ──► Gemini (AI) ──► MySQL (Database)
```
**Expected Outcome:**
* `Trigger`: Status = `success`
* `Gemini Node`: Status = `success`, returns valid output payload
* `MySQL Node`: Status = `success`, persists record to database
* `Workflow`: Status = `success`
* `Execution Log`: 3 node execution log entries recorded with proper durations and timestamps.

---

### Scenario B: Upstream Failure Cascade

```text
Manual Trigger ──► Gemini (AI Fails: e.g. 500 error / quota) ──► MySQL (Database)
```
**Expected Outcome:**
* `Trigger`: Status = `success`
* `Gemini Node`: Status = `failed`, records failure reason and error details
* `MySQL Node`: **NOT executed** (must remain `pending` or `skipped`)
* `Workflow`: Overall Status = `failed`
* `Execution Log`: Error log stored for Gemini node; execution record marked as `failed` with completion timestamp.

---

### Scenario C: Conditional Branching (IF Node)

```text
Trigger ──► IF Condition ──┬──[true]──► Node A
                           └──[false]─► Node B
```
**Expected Outcome:**
* When condition evaluates to `true`:
  * `Node A`: Executes and completes (`success`).
  * `Node B`: Marked as `skipped` (does not execute, does not cause workflow failure).
  * `Workflow`: Overall Status = `success`.

---

## 3. Mocking External Services

* **AI Provider Mocking**:
  - In automated test runs, mock the `IAIProvider` interface to return deterministic responses without making live network calls to Gemini or Ollama.
  - Test provider failure scenarios (timeout, invalid JSON, 429 rate limit) using controllable mock rejections.
* **Database Fixtures**:
  - Run database tests inside isolated transactions that roll back after each test run, or use dedicated test database fixtures.

---

## 4. Quality & Pre-Commit Verification

Before declaring a task done:
1. Run test suite: Ensure all unit and integration tests pass without failures.
2. Run type checker: Ensure `tsc --noEmit` compiles without errors.
3. Run linter: Ensure code passes formatting and linting rules.
4. Verify edge cases: Check null/undefined inputs, empty arrays, and unexpected payload formats.
