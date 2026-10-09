# Project Plan: Personal AI Workflow Orchestrator

## Goal
Build a local workflow automation platform inspired by tools such as n8n.
The system allows users to visually author workflows and execute them deterministically with local MySQL persistence, scheduler, webhooks, Gemini, and Ollama AI integration.

## Core Stack
- **Frontend**: Next.js, React, TypeScript, React Flow
- **Backend**: Node.js, Express, TypeScript
- **Database**: MySQL (migrated schema)
- **AI**: Google Gemini & Local Ollama (Pluggable Abstraction)
- **Version Control**: Git / GitHub (source control only)

---

## Phase Status Summary

- [x] **Phase 1 - Foundation**: Architecture setup, clean directory boundaries, MySQL connection pooling, Express API skeleton, Next.js frontend bootstrap.
- [x] **Phase 2 - Workflow Engine**: Pure headless deterministic DAG runner, cycle detection, input resolution, branching, fan-in/fan-out, fail-fast, error normalization. (86/86 tests).
- [x] **Phase 3 - Visual Workflow Editor**: React Flow canvas, node/edge connections, schema validation bridge, workflow persistence, live graph validation panel.
- [x] **Phase 4 - Node System**: Extensible `NodeRegistry`, manifests, config validation schemas, core utility nodes (`passthrough`, `static_value`, `text_transform`, `condition_branch`). (111/111 tests).
- [x] **Phase 5 - Execution System**:
  - 5.1 Run Model & Lifecycle State Machine (`requested`, `running`, `succeeded`, `failed`, `cancelled`).
  - 5.2 Event Persistence, Chronological Trace & Redaction (secret masking, string & array size limits).
  - 5.3 Execution Monitor UI (run trigger, canvas status overlays, history panel, trace inspection modal).
  - 5.4 Reliability Closeout (timeouts, cooperative cancellation with `AbortSignal`, retry boundaries, failure matrix). (144/144 tests).
- [x] **Phase 6 - Scheduler & Inbound Webhooks**: Local in-process scheduler (`SchedulerService`), inbound webhook endpoint (`POST /api/webhooks/:path`) with secret authentication and payload injection. (151/151 tests).
- [x] **Phase 7 - Ollama & AI Provider Abstraction**: `AIProvider` contract, `OllamaProvider` (local inference), `GeminiProvider`, AI workflow nodes (`ai_generate_text`, `ai_structured_output`). (156/156 tests).
- [x] **Phase 8 - Real AI Automation & Structured Guardrails**: `GuardrailValidator` (prompt injection & code blocklists, schema checks, length limits), `ai_guardrail` node, `controlled_http_request` (anti-SSRF), `human_approval_gate` (human-in-the-loop). (165/165 tests).
