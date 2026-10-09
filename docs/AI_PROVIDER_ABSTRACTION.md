# AI Provider Abstraction & Ollama Integration (Phase 7)

## 1. Architectural Scope & Boundary

- **Pluggable AI Architecture**: The `AIProvider` contract abstracts model interactions behind standard interfaces (`generateText` and `generateStructured`).
- **Supported Providers**:
  1. **Google Gemini**: Remote cloud-based generative AI (via official REST endpoint and API key).
  2. **Ollama**: 100% local self-hosted inference engine running on `http://127.0.0.1:11434` (e.g. `llama3.2`, `mistral`, `qwen2.5`).
- **Security Boundary**: API keys, auth tokens, and sensitive system instructions are never logged, persisted in graph payloads, or transmitted to the visual editor.

---

## 2. Core Provider Interface

```typescript
export interface AIProvider {
  readonly name: string;
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  generateStructured<T = unknown>(options: GenerateStructuredOptions<T>): Promise<{ data: T; rawText: string; model: string }>;
}
```

---

## 3. Workflow AI Nodes

### 1. `ai_generate_text`
- Emits natural text output given dynamic prompt templates and inputs.
- Configurable provider selection (`"default"`, `"gemini"`, or `"ollama"`).
- Supports `{{input}}` template variable replacement for upstream graph inputs.

### 2. `ai_structured_output`
- Guarantees schema-conformant JSON output from either Gemini or Ollama.
- Parses output directly into structured JavaScript objects for downstream workflow logic (e.g. conditional branching, transforms).
