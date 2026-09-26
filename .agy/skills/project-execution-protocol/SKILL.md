---
name: project-execution-protocol
description: >-
  Mandatory protocol for making code changes, implementing features, and resolving bugs.
  Use before and during any code modifications to ensure safe, localized, verified changes
  without breaking existing functionality or expanding scope.
---

# Project Execution Protocol

## Purpose

This skill establishes the mandatory, step-by-step protocol for every code modification, feature addition, and bug fix in the project. It strictly controls code scope and guarantees that every change is intentional, minimal, tested, and documented.

---

## 1. The 10-Step Execution Protocol

Before making any change to the codebase, follow this sequential procedure without skipping steps:

```text
[1. Inspect] ──► [2. Understand] ──► [3. Identify Impact] ──► [4. Explain Plan]
                                                                      │
                                                                      ▼
[8. Report Files] ◄── [7. Inspect Result] ◄── [6. Test] ◄── [5. Minimal Change]
       │
       ▼
[9. Report Tests] ──► [10. Verify Scope]
```

### Step 1: Inspect Relevant Files
* Examine the actual source files, configuration, and types related to the task.
* Never make assumptions about existing signatures, interfaces, or file paths without viewing them first.

### Step 2: Understand Existing Architecture
* Trace how the target component fits into the system (caller, callee, data flow).
* Review existing conventions, patterns, and error handling in neighboring code.

### Step 3: Identify Affected Components
* Determine every module, service, route, or UI component that depends on the code being changed.
* Check database schemas or API contracts that could be impacted.

### Step 4: Explain the Intended Change
* Clearly outline the intended modification before executing it.
* Justify why the proposed approach is the minimal correct solution.

### Step 5: Implement the Smallest Change Necessary
* Modify existing functions and classes rather than creating duplicate versions.
* Keep edits targeted strictly to the required behavior.

### Step 6: Run Relevant Tests
* Execute unit tests, integration tests, or manual test scripts covering the affected area.
* If tests do not exist, verify execution via reproducible run commands or dry runs.

### Step 7: Inspect the Result
* Inspect output logs, returned responses, or UI render states to confirm correctness.
* Check for unintended side effects, warnings, or performance regressions.

### Step 8: Report Changed Files
* List every file added, modified, or deleted with a one-sentence summary of the modification.

### Step 9: Report Tests Performed
* Explicitly state what test suites, commands, or validation steps were run and their outcome.

### Step 10: Do Not Expand Scope
* Stop once the requested task is fulfilled. Do not proceed to unrelated tasks without prompt or approval.

---

## 2. Mandatory "NEVER" Rules

Under no circumstances should the following actions be performed without explicit instruction:

* **NEVER rewrite unrelated files**: Keep edits confined only to what is directly required.
* **NEVER introduce dependencies without approval**: Do not run `npm install <package>` for new libraries without justifying and receiving user confirmation.
* **NEVER change architecture silently**: Do not swap databases, switch state managers, or introduce new architectural layers.
* **NEVER delete working code without justification**: Understand why existing code is there before removing it.
* **NEVER refactor unrelated code**: Do not format, reorder, or modernize adjacent code that is outside the task scope.
* **NEVER create duplicate implementations**: Never create `service-v2.ts`, `helper-new.ts`, or parallel functions for existing responsibilities.
* **NEVER "improve" things outside the current task**: Do not fix stylistic preferences or speculative future needs beyond what the user asked for.

---

## 3. Post-Task Completion Checklist

Before reporting completion to the user, ensure all boxes are checked:
- [ ] Only relevant files were touched.
- [ ] Root cause was resolved (not masked with temporary flags/fallbacks).
- [ ] No temporary `console.log` statements or commented-out code were left behind.
- [ ] Tests or manual verifications succeeded.
- [ ] Exact list of modified files and verification results are ready to present.