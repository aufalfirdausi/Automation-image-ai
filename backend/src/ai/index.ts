import type { AIProvider } from "./types.js";
import { GeminiProvider } from "./gemini.provider.js";
import { OllamaProvider } from "./ollama.provider.js";

export * from "./types.js";
export * from "./gemini.provider.js";
export * from "./ollama.provider.js";

const providers = new Map<string, AIProvider>();

// Register standard built-in providers
providers.set("gemini", new GeminiProvider());
providers.set("ollama", new OllamaProvider());

export function registerAIProvider(provider: AIProvider): void {
  providers.set(provider.name.toLowerCase(), provider);
}

export function getAIProvider(name?: string): AIProvider {
  const target = (name || process.env.DEFAULT_AI_PROVIDER || "gemini").toLowerCase();
  const provider = providers.get(target);
  if (!provider) {
    throw new Error(`AI Provider '${target}' is not registered. Available: ${Array.from(providers.keys()).join(", ")}`);
  }
  return provider;
}
