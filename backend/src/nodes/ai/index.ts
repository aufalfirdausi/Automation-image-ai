import type { NodeDefinition } from "../types.js";
import { defaultNodeRegistry } from "../registry.js";
import { getAIProvider, type AIProvider } from "../../ai/index.js";

export interface AITextGenerationConfig {
  provider?: "default" | "gemini" | "ollama";
  model?: string;
  promptTemplate?: string;
  systemInstruction?: string;
  temperature?: number;
}

export const aiTextGenerationNodeDefinition: NodeDefinition<
  AITextGenerationConfig,
  unknown,
  string
> = {
  manifest: {
    type: "ai_generate_text",
    name: "AI Text Generation",
    version: "1.0.0",
    description: "Generates natural text using Gemini or Ollama AI providers.",
    category: "ai",
    inputs: [{ id: "prompt", label: "Prompt / Context Input" }],
    outputs: [{ id: "text", label: "Generated Text Output" }],
    configFields: [
      {
        name: "provider",
        label: "AI Provider",
        type: "select",
        required: false,
        defaultValue: "default",
        options: [
          { label: "Default Configured", value: "default" },
          { label: "Google Gemini", value: "gemini" },
          { label: "Local Ollama", value: "ollama" },
        ],
      },
      {
        name: "model",
        label: "Model Name",
        type: "string",
        required: false,
        description: "Custom model override (e.g. gemini-1.5-flash or llama3.2).",
      },
      {
        name: "promptTemplate",
        label: "Prompt Template",
        type: "string",
        required: false,
        description: "Template string. Use {{input}} to interpolate incoming node data.",
      },
      {
        name: "systemInstruction",
        label: "System Instruction",
        type: "string",
        required: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      const config = params.config || {};
      const providerName = config.provider === "default" ? undefined : config.provider;
      const provider: AIProvider = getAIProvider(providerName);

      // Determine prompt string
      const rawInput =
        typeof params.input === "string"
          ? params.input
          : params.input !== null && params.input !== undefined
          ? JSON.stringify(params.input)
          : "";

      let prompt = rawInput;
      if (config.promptTemplate && config.promptTemplate.trim().length > 0) {
        prompt = config.promptTemplate.replace(/\{\{input\}\}/g, rawInput);
      }

      if (!prompt.trim()) {
        return {
          success: false,
          error: {
            code: "EMPTY_PROMPT",
            message: "AI prompt cannot be empty. Provide input or configure promptTemplate.",
          },
        };
      }

      const result = await provider.generateText({
        prompt,
        model: config.model,
        systemInstruction: config.systemInstruction,
        temperature: config.temperature,
      });

      return {
        success: true,
        output: result.text,
      };
    },
  },
};

export interface AIStructuredOutputConfig {
  provider?: "default" | "gemini" | "ollama";
  model?: string;
  promptTemplate?: string;
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

export const aiStructuredOutputNodeDefinition: NodeDefinition<
  AIStructuredOutputConfig,
  unknown,
  unknown
> = {
  manifest: {
    type: "ai_structured_output",
    name: "AI Structured Output",
    version: "1.0.0",
    description: "Generates typed, schema-validated JSON data using Gemini or Ollama.",
    category: "ai",
    inputs: [{ id: "prompt", label: "Prompt / Data Input" }],
    outputs: [{ id: "data", label: "Structured JSON Output" }],
    configFields: [
      {
        name: "provider",
        label: "AI Provider",
        type: "select",
        required: false,
        defaultValue: "default",
        options: [
          { label: "Default Configured", value: "default" },
          { label: "Google Gemini", value: "gemini" },
          { label: "Local Ollama", value: "ollama" },
        ],
      },
      {
        name: "model",
        label: "Model Name",
        type: "string",
        required: false,
      },
      {
        name: "promptTemplate",
        label: "Prompt Template",
        type: "string",
        required: false,
      },
      {
        name: "systemInstruction",
        label: "System Instruction",
        type: "string",
        required: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      const config = params.config || {};
      const providerName = config.provider === "default" ? undefined : config.provider;
      const provider: AIProvider = getAIProvider(providerName);

      const rawInput =
        typeof params.input === "string"
          ? params.input
          : params.input !== null && params.input !== undefined
          ? JSON.stringify(params.input)
          : "";

      let prompt = rawInput;
      if (config.promptTemplate && config.promptTemplate.trim().length > 0) {
        prompt = config.promptTemplate.replace(/\{\{input\}\}/g, rawInput);
      }

      if (!prompt.trim()) {
        return {
          success: false,
          error: {
            code: "EMPTY_PROMPT",
            message: "Prompt is empty for AI Structured Output.",
          },
        };
      }

      const result = await provider.generateStructured({
        prompt,
        model: config.model,
        systemInstruction: config.systemInstruction,
        responseSchema: config.responseSchema,
        temperature: config.temperature,
      });

      return {
        success: true,
        output: result.data,
      };
    },
  },
};

export function registerAINodes(registry = defaultNodeRegistry): void {
  const nodes = [aiTextGenerationNodeDefinition, aiStructuredOutputNodeDefinition];
  for (const node of nodes) {
    if (!registry.has(node.manifest.type)) {
      registry.register(node);
    }
  }
}
