# Architecture Decisions

## ADR-001: Use MySQL

Status: Accepted

Decision:

Use MySQL as the primary database.

Reason:

- Developer already has experience with MySQL.
- Workflow data has clear relational relationships.
- MySQL supports JSON fields where flexible node configuration is required.
- Introducing MongoDB would add unnecessary technology overhead.

Consequences:

- Workflow entities will use relational tables.
- Node-specific configuration may use JSON fields where appropriate.

then

## ADR-002: Use Node.js Backend

Status: Accepted

Decision:

Use Node.js with TypeScript as the backend.

Reason:

- Existing JavaScript/TypeScript knowledge.
- Same language ecosystem between frontend and backend.
- Suitable for asynchronous API and workflow execution.

then

## ADR-003: React Flow

Status: Accepted

Decision:

Use React Flow for the visual workflow editor.

Reason:

- Provides graph-based UI primitives.
- Avoids implementing node positioning and edge management from scratch.
- Integrates naturally with React.
