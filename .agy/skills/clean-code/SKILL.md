---
name: clean-code
description: >-
  Defines mandatory clean-code, simplicity, and code-maintenance standards.
  Use when writing, refactoring, fixing bugs, or reviewing code to ensure minimal,
  maintainable, and correct implementations without dead or duplicate code.
---

# Clean Code Skill

## Purpose

This skill defines mandatory clean-code and code-maintenance standards for the project.

The primary goal is to keep the codebase:

* clean
* readable
* maintainable
* consistent
* minimal
* predictable
* free from unnecessary duplication
* free from obsolete implementations
* easy for humans and AI agents to understand

Clean code does **not** mean minimizing line count at all costs.

The goal is to produce the **simplest correct implementation** that maintains clarity, maintainability, and architectural consistency.

---

# 1. Core Principles

Follow these principles for every implementation, modification, debugging task, and refactoring task.

### 1.1 Modify Before Append

When existing code already handles the requested functionality, modify the existing implementation before creating a new implementation.

Do not automatically create:

* duplicate functions
* duplicate services
* duplicate components
* `New`, `V2`, `Fixed`, `Final`, or similar copies
* parallel implementations of the same responsibility

Preferred:

```text
Existing implementation
        ↓
Understand root cause
        ↓
Modify existing implementation
        ↓
Remove obsolete code
        ↓
Test
```

Avoid:

```text
Existing implementation
        ↓
Add new implementation
        ↓
Redirect some callers
        ↓
Leave old implementation
```

---

# 2. No Dead Code

Do not leave code that is no longer used.

Dead code includes:

* unused functions
* unused variables
* unused imports
* unreachable branches
* obsolete components
* obsolete services
* unused configuration
* abandoned implementations
* commented-out implementations
* unused dependencies
* temporary debugging code

If code has been replaced and is no longer required, remove it.

Do not preserve obsolete code merely because it might be useful someday.

Git provides version history. The source code does not need to function as a museum of previous attempts.

---

# 3. Never Comment Out Old Implementations

Do not use comments to preserve old code.

Bad:

```ts
function executeNode() {
  // const result = oldImplementation();
  // return result;

  const result = newImplementation();
  return result;
}
```

Preferred:

```ts
function executeNode() {
  const result = newImplementation();
  return result;
}
```

If the previous implementation needs to be recovered, use Git history.

---

# 4. No Duplicate Implementations

Do not create multiple functions, classes, services, or components that perform substantially the same responsibility.

Avoid:

```text
getWorkflow()
getWorkflowById()
getWorkflowData()
fetchWorkflow()
loadWorkflow()
```

when several of them perform the same operation without a meaningful distinction.

Before creating a new implementation:

1. Search the codebase.
2. Identify existing functionality.
3. Determine whether it can be reused or modified.
4. Only create a new implementation if there is a genuine separate responsibility.

---

# 5. No Duplicate Files

Do not create files such as:

```text
WorkflowService.ts
WorkflowServiceNew.ts
WorkflowServiceV2.ts
WorkflowServiceFixed.ts
WorkflowServiceFinal.ts
WorkflowServiceFinal2.ts
```

When an existing file owns the responsibility, modify or refactor that file.

Create a new file only when the new functionality represents a genuinely separate responsibility.

---

# 6. Root Cause First

When fixing a bug, identify the root cause before modifying the code.

Do not blindly add conditions, fallbacks, flags, or workarounds until the error disappears.

Required process:

```text
Observe error
    ↓
Reproduce error
    ↓
Trace execution
    ↓
Identify root cause
    ↓
Determine smallest correct fix
    ↓
Implement
    ↓
Test
```

Do not treat symptoms when the underlying cause can be fixed directly.

---

# 7. Minimal Correct Change

Prefer the smallest change that correctly solves the problem.

For a localized bug:

```text
Bug
 ↓
Relevant implementation
 ↓
Targeted fix
 ↓
Test
```

Do not unnecessarily:

* rewrite unrelated modules
* rename unrelated variables
* restructure unrelated folders
* introduce new libraries
* refactor unrelated code
* change architecture
* modify working functionality

unless the current implementation genuinely prevents the requested change.

---

# 8. No Unnecessary Abstraction

Do not create abstractions simply because abstraction is considered a "best practice."

Avoid unnecessary layers such as:

```text
Controller
    ↓
Service
    ↓
Manager
    ↓
Handler
    ↓
Adapter
    ↓
Repository
    ↓
Provider
```

when the project does not require them.

Introduce an abstraction when there is a concrete reason, such as:

* repeated behavior
* multiple implementations
* clear separation of responsibilities
* testability
* architectural requirement
* external provider abstraction
* meaningful domain boundary

Prefer simple code over speculative architecture.

---

# 9. Single Responsibility

Each function, class, component, service, and module should have a clear responsibility.

Avoid functions that simultaneously:

```text
validate input
authenticate user
query database
transform data
call AI
send response
write logs
```

when these responsibilities can be reasonably separated.

However, do not split every small operation into its own function without a meaningful reason.

The goal is **clear responsibility**, not maximum fragmentation.

---

# 10. Naming

Names must clearly communicate purpose.

Prefer:

```ts
executeWorkflow()
validateWorkflow()
createExecution()
saveExecutionLog()
resolveNextNodes()
```

Avoid vague names:

```ts
process()
handle()
doStuff()
data()
result()
temp()
thing()
helper()
```

unless the context makes the meaning genuinely obvious.

Avoid unnecessary abbreviations.

Prefer:

```ts
workflowId
executionContext
nodeConfiguration
```

over:

```ts
wfId
execCtx
nodeCfg
```

unless the abbreviation is an established project convention.

---

# 11. Keep Functions Focused

Functions should generally do one meaningful thing.

Prefer:

```ts
validateWorkflow()
createExecution()
executeNode()
saveExecutionResult()
```

rather than one extremely large function responsible for the entire lifecycle.

If a function becomes difficult to understand, evaluate whether a meaningful responsibility can be extracted.

Do not extract functions merely to reduce line count.

---

# 12. Avoid Magic Values

Avoid unexplained values embedded directly in logic.

Bad:

```ts
if (retryCount > 3) {
  ...
}
```

Preferred:

```ts
const MAX_RETRIES = 3;

if (retryCount > MAX_RETRIES) {
  ...
}
```

The name should communicate the meaning of the value.

---

# 13. Avoid Excessive Nesting

Avoid deeply nested logic.

Bad:

```ts
if (workflow) {
  if (workflow.nodes) {
    if (workflow.nodes.length > 0) {
      if (execution) {
        ...
      }
    }
  }
}
```

Prefer early validation or guard clauses where appropriate.

Example:

```ts
if (!workflow) {
  throw new Error("Workflow not found");
}

if (!workflow.nodes.length) {
  throw new Error("Workflow has no nodes");
}

if (!execution) {
  throw new Error("Execution not found");
}
```

Keep the main execution path easy to read.

---

# 14. Error Handling

Errors must be handled intentionally.

Do not:

* silently swallow errors
* use empty `catch` blocks
* return meaningless fallback values
* hide failures
* log sensitive information
* retry indefinitely

Bad:

```ts
try {
  await executeNode();
} catch {
}
```

Preferred:

```ts
try {
  await executeNode();
} catch (error) {
  logger.error("Node execution failed", {
    nodeId,
    executionId,
    error,
  });

  throw error;
}
```

Error handling must preserve enough context to diagnose failures.

---

# 15. Temporary Workarounds

If a temporary workaround is genuinely necessary:

1. Clearly document why it exists.
2. Keep it as small as possible.
3. Avoid spreading it across the codebase.
4. Identify what condition makes it unnecessary.
5. Remove it when the underlying issue is resolved.

Do not allow temporary workarounds to silently become permanent architecture.

---

# 16. Cleanup After Every Change

After implementing or modifying functionality, perform a cleanup pass.

Check for:

* unused imports
* unused variables
* unused functions
* duplicate logic
* duplicate files
* obsolete code
* commented-out code
* temporary debugging statements
* unnecessary dependencies
* unnecessary abstractions
* unnecessary comments
* inconsistent naming
* dead branches

Required workflow:

```text
Implement
   ↓
Test
   ↓
Cleanup
   ↓
Test again
   ↓
Report
```

Do not consider the task complete immediately after the first successful test.

---

# 17. Dependencies

Do not add a dependency unless it provides meaningful value.

Before adding a package:

1. Check whether the functionality already exists in the project.
2. Check whether the standard library can solve the problem.
3. Check whether an existing dependency already provides the required functionality.
4. Consider the maintenance cost.
5. Add the dependency only if justified.

After adding a dependency, verify that it is actually used.

Do not leave unused packages in the project.

---

# 18. Refactoring

Refactoring is allowed and encouraged when it improves maintainability, but it must remain within the task scope.

When refactoring:

* preserve behavior
* avoid unrelated changes
* keep changes understandable
* run relevant tests
* remove obsolete implementation
* do not introduce speculative abstractions

If a larger architectural refactor appears necessary, stop and report the reason before proceeding.

---

# 19. Preserve Existing Behavior

When modifying existing functionality, preserve behavior that is not explicitly being changed.

Before modifying code, identify:

* what the current behavior is
* what the requested behavior should become
* which behavior must remain unchanged

Do not "fix" unrelated behavior simply because it could be improved.

---

# 20. Verify Before Deleting

Do not delete code solely because it appears unused in the currently inspected file.

Before deleting an implementation, verify:

* imports
* references
* routes
* API usage
* tests
* configuration
* dynamic usage where applicable
* framework conventions
* runtime usage where applicable

Only remove the code when there is sufficient evidence that it is obsolete.

---

# 21. Project Consistency

Follow existing project conventions.

Before creating new code:

1. Inspect similar existing implementations.
2. Follow established naming.
3. Follow established folder structure.
4. Reuse existing utilities where appropriate.
5. Follow existing error-handling patterns.
6. Follow existing API conventions.

Do not introduce a different coding style for the same project without a clear reason.

---

# 22. Comments

Comments should explain **why**, not restate **what** the code already clearly expresses.

Bad:

```ts
// Increment retry count by one
retryCount++;
```

Useful:

```ts
// Gemini may return 429 during temporary rate limiting.
// Retry with exponential backoff before marking the node as failed.
```

Do not use comments to preserve obsolete code.

---

# 23. Logging

Logs must be useful for debugging without becoming noise.

Do not leave:

```ts
console.log("test");
console.log("here");
console.log("hello");
console.log(data);
```

in production code.

Remove temporary debugging logs after the issue is resolved.

Use the project's established logging mechanism where one exists.

Never log:

* API keys
* passwords
* authentication tokens
* secrets
* sensitive credentials

---

# 24. Code Duplication

When similar logic appears multiple times, determine whether it represents:

1. genuinely separate behavior, or
2. accidental duplication.

Do not immediately abstract every similar-looking block.

Refactor duplicated logic when:

* the behavior is genuinely the same
* changes would otherwise need to be made in multiple places
* a shared abstraction improves clarity

Avoid abstraction when the similarity is superficial and the responsibilities are different.

---

# 25. AI Agent Behavior

When modifying the codebase, the agent must not optimize for "making the error disappear" alone.

The agent must optimize for:

```text
Correctness
+
Maintainability
+
Clarity
+
Consistency
+
Minimal unnecessary complexity
```

If the easiest way to make a test pass creates duplicate or obsolete code, do not use that approach.

If the existing implementation is fundamentally wrong, replace it cleanly rather than stacking another implementation on top of it.

---

# 26. Required Change Procedure

For every non-trivial code change:

### Step 1: Inspect

Inspect the relevant files and existing implementation.

### Step 2: Understand

Determine:

* current behavior
* intended behavior
* dependencies
* affected modules

### Step 3: Search

Search for existing implementations, references, utilities, and related functionality.

### Step 4: Plan

Determine whether to:

* modify existing code
* refactor existing code
* create a new implementation

Prefer modification or refactoring when appropriate.

### Step 5: Implement

Make the smallest correct change.

### Step 6: Validate

Run the relevant tests, type checks, linting, or application checks.

### Step 7: Cleanup

Remove obsolete code and unnecessary artifacts introduced during development.

### Step 8: Validate Again

Run the relevant checks again after cleanup.

### Step 9: Report

Report:

* files changed
* what changed
* why it changed
* tests/checks performed
* any remaining concerns

---

# 27. Definition of Done

A code change is not considered complete until:

* [ ] Requested functionality works.
* [ ] Existing required behavior is preserved.
* [ ] Root cause was addressed when fixing a bug.
* [ ] No duplicate implementation was introduced.
* [ ] No obsolete implementation remains.
* [ ] No commented-out old implementation remains.
* [ ] No unnecessary files were created.
* [ ] No unused imports remain.
* [ ] No unused variables remain.
* [ ] No unnecessary dependencies were added.
* [ ] No unnecessary abstraction was introduced.
* [ ] Temporary debugging code was removed.
* [ ] Relevant tests pass.
* [ ] Type checking passes where applicable.
* [ ] Linting passes where applicable.
* [ ] Code follows existing project conventions.
* [ ] Architecture remains consistent.
* [ ] Documentation is updated when necessary.

---

# 28. Final Rule

**Do not stack code on top of broken code when the existing implementation should be corrected.**

Prefer:

```text
Understand
   ↓
Fix
   ↓
Remove obsolete code
   ↓
Simplify
   ↓
Test
```

over:

```text
Broken code
   ↓
Add workaround
   ↓
Add another workaround
   ↓
Add another function
   ↓
Add another file
   ↓
Hope it works
```

The codebase must become **cleaner after a change, not merely functional**.
