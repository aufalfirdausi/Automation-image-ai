import type { NodeDefinition } from "../../types.js";
import { defaultNodeRegistry } from "../../registry.js";
import { getAIProvider, type AIProvider } from "../../../ai/index.js";

export interface AIImageGenerationConfig {
  provider?: "default" | "gemini";
  model?: string;
  promptTemplate?: string;
  systemInstruction?: string;
  temperature?: number;
  width?: number;
  height?: number;
}

export interface AIImageGenerationOutput {
  imageUrl?: string;
  base64Image?: string;
  model: string;
}

export const aiImageGenerationNodeDefinition: NodeDefinition<
  AIImageGenerationConfig,
  unknown,
  AIImageGenerationOutput
> = {
  manifest: {
    type: "ai_generate_image",
    name: "AI Image Generation",
    version: "1.0.0",
    description: "Generates images using Gemini Image model.",
    category: "ai",
    inputs: [{ id: "prompt", label: "Image Prompt (English)" }],
    outputs: [
      { id: "imageUrl", label: "Generated Image URL (if available)" },
      { id: "base64Image", label: "Base64 encoded image data" },
    ],
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
        ],
      },
      {
        name: "model",
        label: "Model Name",
        type: "string",
        required: false,
        description: "Custom model override (e.g. ag/gemini-3.1-flash-image).",
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
      {
        name: "width",
        label: "Width",
        type: "number",
        required: false,
        defaultValue: 1080,
        description: "Output image width in pixels.",
      },
      {
        name: "height",
        label: "Height",
        type: "number",
        required: false,
        defaultValue: 1350,
        description: "Output image height in pixels.",
      },
    ],
  },
  handler: {
    async execute(params) {
      const config = params.config || {};
      const providerName = config.provider === "default" ? undefined : config.provider;
      const provider: AIProvider = getAIProvider(providerName);

      let prompt = "";
      if (typeof params.input === "string") {
        prompt = params.input;
      } else if (params.input && typeof params.input === "object") {
        const anyInput = params.input as Record<string, unknown>;
        if (typeof anyInput.cover_image_prompt === "string") {
          prompt = anyInput.cover_image_prompt;
        } else if (typeof anyInput.image_prompt === "string") {
          prompt = anyInput.image_prompt;
        } else if (typeof anyInput.prompt === "string") {
          prompt = anyInput.prompt;
        } else {
          prompt = JSON.stringify(params.input);
        }
      }

      if (config.promptTemplate && config.promptTemplate.trim().length > 0) {
        prompt = config.promptTemplate.replace(/\{\{input\}\}/g, prompt);
      }

      if (!prompt.trim()) {
        return {
          success: false,
          error: {
            code: "EMPTY_PROMPT",
            message: "AI image prompt cannot be empty. Provide input or configure promptTemplate.",
          },
        };
      }

      const result = await (provider as any).generateImage?.({
        prompt,
        model: config.model,
        systemInstruction: config.systemInstruction,
        temperature: config.temperature,
        width: config.width || 1080,
        height: config.height || 1350,
        signal: params.signal,
      });

      if (!result || (!result.imageUrl && !result.base64Image)) {
        return {
          success: false,
          error: {
            code: "NO_IMAGE_OUTPUT",
            message: "Image generation returned no data.",
          },
        };
      }

      return {
        success: true,
        output: {
          imageUrl: result.imageUrl,
          base64Image: result.base64Image,
          model: result.model,
        },
      };
    },
  },
};

export function registerAIImageNodes(registry = defaultNodeRegistry): void {
  const nodes = [aiImageGenerationNodeDefinition];
  for (const node of nodes) {
    if (!registry.has(node.manifest.type)) {
      registry.register(node);
    }
  }
}
