import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { OllamaProvider } from "../src/ai/ollama.provider.js";
import { GeminiProvider } from "../src/ai/gemini.provider.js";
import { registerAIProvider, getAIProvider, type AIProvider } from "../src/ai/index.js";
import { executeWorkflow } from "../src/engine/runner.js";
import { defaultNodeRegistry, registerCoreNodes, registerAINodes } from "../src/nodes/index.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 7: Ollama & AI Provider Abstraction Tests", () => {
  const originalFetch = globalThis.fetch;

  before(() => {
    registerCoreNodes();
    registerAINodes();
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("OllamaProvider sends correct payload and extracts generated text", async () => {
    let capturedBody: any = null;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          response: "Hello from local Ollama model!",
          prompt_eval_count: 12,
          eval_count: 8,
        }),
      } as any;
    }) as any;

    const ollama = new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", defaultModel: "llama3.2" });
    const res = await ollama.generateText({ prompt: "Say hello", temperature: 0.7 });

    assert.equal(res.text, "Hello from local Ollama model!");
    assert.equal(res.model, "llama3.2");
    assert.equal(res.usage?.totalTokens, 20);
    assert.equal(capturedBody.prompt, "Say hello");
    assert.equal(capturedBody.options.temperature, 0.7);
  });

  it("OllamaProvider parses structured JSON output cleanly", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({ sentiment: "positive", score: 0.95 }),
        }),
      } as any;
    }) as any;

    const ollama = new OllamaProvider();
    const res = await ollama.generateStructured<{ sentiment: string; score: number }>({
      prompt: "Classify this text",
    });

    assert.deepEqual(res.data, { sentiment: "positive", score: 0.95 });
  });

  it("GeminiProvider formats Gemini API request and extracts candidate text", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: "Gemini generated response text" }] },
            },
          ],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10, totalTokenCount: 25 },
        }),
      } as any;
    }) as any;

    const gemini = new GeminiProvider({ apiKey: "test-gemini-key", defaultModel: "gemini-1.5-flash" });
    const res = await gemini.generateText({
      prompt: "Explain relativity in one sentence",
      systemInstruction: "You are a physics professor",
    });

    assert.equal(res.text, "Gemini generated response text");
    assert.ok(capturedUrl.includes("gemini-1.5-flash:generateContent?key=test-gemini-key"));
    assert.equal(capturedBody.contents[0].parts[0].text, "Explain relativity in one sentence");
    assert.equal(capturedBody.systemInstruction.parts[0].text, "You are a physics professor");
  });

  it("executes ai_generate_text node seamlessly in workflow engine", async () => {
    // Register mock provider for deterministic workflow run
    const mockProvider: AIProvider = {
      name: "mock_ai",
      async generateText(options) {
        return { text: `AI: [${options.prompt}]`, model: "mock-v1" };
      },
      async generateStructured() {
        return { data: { success: true }, rawText: "{}", model: "mock-v1" };
      },
    };
    registerAIProvider(mockProvider);

    const workflow: Workflow = {
      id: "wf_ai_test",
      name: "AI Test Workflow",
      nodes: [
        {
          id: "step_static",
          type: "static_value",
          config: { value: "Orchestrator Automation" },
        },
        {
          id: "step_ai",
          type: "ai_generate_text",
          config: {
            provider: "mock_ai",
            promptTemplate: "Analyze the topic: {{input}}",
          },
        },
      ],
      edges: [{ source: "step_static", target: "step_ai" }],
    };

    const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());

    assert.equal(summary.status, "completed");
    assert.equal(summary.nodeStates["step_ai"], "completed");
    assert.equal(summary.context.nodeOutputs["step_ai"], "AI: [Analyze the topic: Orchestrator Automation]");
  });

  it("executes ai_structured_output node in workflow engine producing parsed JSON", async () => {
    const mockProvider: AIProvider = {
      name: "mock_structured_ai",
      async generateText() {
        return { text: "unused", model: "mock-v1" };
      },
      async generateStructured(options) {
        return {
          data: { summary: "Extracted summary", tagCount: 3 },
          rawText: '{"summary":"Extracted summary","tagCount":3}',
          model: "mock-v1",
        };
      },
    };
    registerAIProvider(mockProvider);

    const workflow: Workflow = {
      id: "wf_structured_test",
      name: "Structured AI Workflow",
      nodes: [
        {
          id: "node_json_ai",
          type: "ai_structured_output",
          config: {
            provider: "mock_structured_ai",
            promptTemplate: "Summarize this: {{input}}",
          },
        },
      ],
      edges: [],
    };

    const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());

    assert.equal(summary.status, "completed");
    assert.deepEqual(summary.context.nodeOutputs["node_json_ai"], {
      summary: "Extracted summary",
      tagCount: 3,
    });
  });
});
