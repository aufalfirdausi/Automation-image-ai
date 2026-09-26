# Architecture

## Frontend

Responsibilities:
- workflow editor
- workflow configuration
- execution monitoring
- dashboard

Technology:
- Next.js
- TypeScript
- React Flow

Frontend must not contain workflow execution logic.

---

## Backend

Responsibilities:
- API
- workflow persistence
- workflow execution
- node execution
- execution logging

Technology:
- Node.js
- TypeScript

---

## Database

Technology:
- MySQL

Responsibilities:
- workflows
- nodes
- edges
- executions
- execution logs
