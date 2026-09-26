---
name: backend-engineer
description: >-
  Standards and best practices for Node.js and TypeScript backend development.
  Use when creating or modifying REST APIs, controllers, services, middleware,
  request validation, and error-handling mechanisms.
---

# Backend Engineer Skill

## Purpose

This skill defines the technical standards, layering principles, and conventions for the backend of the **Orchestrator** platform built with **Node.js** and **TypeScript**.

---

## 1. Architectural Layers & Responsibilities

The backend follows a strict 3-tier separation of concerns:

```text
HTTP Request
     │
     ▼
┌─────────────────────────┐
│       Controllers       │  • Route definitions & HTTP status codes
│                         │  • Request body / query / param extraction
└────────────┬────────────┘  • Invokes service methods (no business logic)
             │
             ▼
┌─────────────────────────┐
│        Services         │  • Pure business logic & workflow orchestration
│                         │  • Coordinates database operations and AI calls
└────────────┬────────────┘  • Reusable across CLI, cron, or webhooks
             │
             ▼
┌─────────────────────────┐
│   Data Access / Models  │  • Database queries (MySQL) & transactions
│                         │  • Type-safe schema mapping & entity definitions
└─────────────────────────┘
```

### 1.1 Controllers
* **Single Responsibility**: Handle HTTP mechanics only.
* Never place SQL queries or direct AI provider invocations inside a controller.
* Format responses using a consistent envelope structure:
  ```ts
  // Success response
  res.status(200).json({ success: true, data: result });

  // Error response
  res.status(400).json({ success: false, error: { message: "Invalid workflow ID", code: "INVALID_INPUT" } });
  ```

### 1.2 Services
* Own all workflow state transitions, execution step sequencing, and validation.
* Services must be testable without requiring an active HTTP request context.

### 1.3 Middleware
* Extract cross-cutting concerns: authentication, request logging, rate limiting, and centralized error handling.

---

## 2. Request Validation

* **Validate at the boundary**: Every incoming API request (body, query params, headers) must be validated before passing to the service layer.
* Use schema validation (e.g. Zod or strict TypeScript validators) to ensure required fields, proper types, and valid string formats.
* Fail fast: Return HTTP 400 Bad Request immediately with descriptive field errors if validation fails.

---

## 3. Centralized Error Handling

* **Never silently swallow errors**: Empty `catch {}` blocks are strictly forbidden.
* Always handle errors intentionally or forward them to the central error middleware via `next(err)`.
* Differentiate between client errors (4xx) and unhandled server errors (500).
* Sanitize error output in production: Never expose raw stack traces, database credentials, or internal system paths to the client.

```ts
// Example centralized error handler pattern
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Unhandled error occurred", {
    path: req.path,
    method: req.method,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  res.status((err as any).statusCode || 500).json({
    success: false,
    error: {
      message: err.message || "Internal server error",
      code: (err as any).code || "INTERNAL_ERROR",
    },
  });
});
```

---

## 4. TypeScript Guidelines

* **Strict Mode**: Maintain full type safety; do not disable `noImplicitAny`.
* **Explicit Interfaces**: Define shared contracts and DTOs (Data Transfer Objects) for all API payloads and internal models.
* Avoid using `any`. If a dynamic payload is necessary (e.g., node configuration or workflow execution context), use `Record<string, unknown>` with runtime validation.
* Maintain clean module imports without circular dependencies.
