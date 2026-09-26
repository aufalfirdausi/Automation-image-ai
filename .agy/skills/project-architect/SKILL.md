---
name: project-architect
description: >-
  Enforces core system architecture, technology stack boundaries, and governance rules.
  Use when designing features, planning architectural modifications, evaluating new
  frameworks, libraries, databases, message queues, or external providers.
---

# Project Architect Skill

## Purpose

This skill governs the system architecture and technology stack for the **Orchestrator** platform. It ensures structural integrity, prevents architectural drift, and protects the codebase against unauthorized dependencies or unnecessary complexity.

---

## 1. Fixed Core Architecture

The core technology stack of this project is fixed. **DO NOT change or replace the core architecture without explicit approval.**

| Layer | Approved Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **Next.js**, **React**, **TypeScript**, **React Flow** | Web UI, interactive node-based workflow canvas, execution visualization |
| **Backend** | **Node.js**, **TypeScript** | REST API, workflow execution engine, graph traversal, provider orchestration |
| **Database** | **MySQL** | Relational storage for workflows, nodes, edges, executions, and execution logs |
| **AI Providers** | **Gemini** (Primary), **Ollama** (Local / Planned) | LLM inference, structured output generation, agentic tasks |
| **Version Control** | **Git** + **GitHub** | Source control, feature branches, pull requests |

---

## 2. Architectural Approval Gate (Strict RFC)

Before introducing any of the following into the project, you **MUST** explain why it is necessary, provide trade-offs, and **wait for explicit user approval**:

* A new frontend or backend framework
* A new database (e.g. PostgreSQL, MongoDB, SQLite)
* A new ORM / Query Builder (e.g. Prisma, Drizzle, TypeORM)
* A queue or background job system (e.g. BullMQ, RabbitMQ, Kafka)
* In-memory caching layers (e.g. Redis)
* Containerization / orchestration (e.g. Docker, Kubernetes)
* An additional AI provider (beyond Gemini and Ollama)
* Any external service dependency

### Architectural Decision Request Template:
When proposing any architectural change, provide:
1. **Problem Statement**: What concrete limitation exists in the current stack?
2. **Proposed Solution**: What library/tool is proposed?
3. **Alternative Solutions**: Can the current stack (Node.js/TypeScript/MySQL) handle it without added infrastructure?
4. **Maintenance Impact**: Dependency footprint, operational complexity, and migration cost.

---

## 3. High-Level System Topology

```text
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (Next.js + React Flow)             │
│   • Visual Workflow Builder    • Node Inspector / Settings  │
│   • Execution Run & Logs View  • Real-time Status Tracking  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST API
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Node.js + TypeScript)             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Controller & Route Layer (Validation, Auth, CORS)    │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Workflow Engine & Graph Traversal (DAG, State, Log) │   │
│   └───────────────┬─────────────────────┬───────────────┘   │
│                   │                     │                   │
│                   ▼                     ▼                   │
│   ┌─────────────────────────┐ ┌─────────────────────────┐  │
│   │ AI Provider Layer       │ │ Database Access Layer   │  │
│   │ • Gemini   • Ollama     │ │ • MySQL Connections     │  │
│   └─────────────────────────┘ └─────────────────────────┘  │
└──────────────────────────────────────────┬──────────────────┘
                                           │
                                           ▼
                            ┌─────────────────────────────┐
                            │        MySQL Database       │
                            │  • workflows   • nodes      │
                            │  • edges       • executions │
                            │  • execution_logs           │
                            └─────────────────────────────┘
```

---

## 4. Architectural Rules & Separation of Concerns

1. **Frontend Isolation**: The frontend must never communicate directly with MySQL or call third-party AI APIs directly. All operations pass through the backend API.
2. **Provider Abstraction**: Node implementations must never call raw SDKs directly. All AI interactions must pass through the unified AI Provider Layer.
3. **Stateless Engine**: The backend execution engine should track state in the database (`executions` and `execution_logs`), keeping individual service instances horizontally scalable.
4. **Minimal External Dependencies**: Prefer clean, native TypeScript implementations over heavy external packages for simple utility logic.
