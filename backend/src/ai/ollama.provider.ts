import { AIProviderError, type AIProvider, type GenerateTextOptions, type GenerateTextResult, type GenerateStructuredOptions } from "./types.js";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private defaultModel: string;

  constructor(options?: { baseUrl?: string; defaultModel?: string }) {
    this.baseUrl = (options?.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
    this.defaultModel = options?.defaultModel || process.env.OLLAMA_DEFAULT_MODEL || "llama3.2";
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/api/generate`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          system: options.systemInstruction,
          stream: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIProviderError(
          `Ollama API returned HTTP ${response.status}: ${errorText || response.statusText}`,
          this.name,
          "OLLAMA_HTTP_ERROR",
          response.status
        );
      }

      const json = (await response.json()) as any;
      const text = json.response || "";

      return {
        text,
        model,
        usage: {
          promptTokens: json.prompt_eval_count,
          candidateTokens: json.eval_count,
          totalTokens: (json.prompt_eval_count || 0) + (json.eval_count || 0),
        },
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const isAbort = (err as any)?.name === "AbortError";
      throw new AIProviderError(
        isAbort ? "Request timed out" : (err instanceof Error ? err.message : String(err)),
        this.name,
        isAbort ? "OLLAMA_TIMEOUT" : "OLLAMA_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructured<T = unknown>(
    options: GenerateStructuredOptions
  ): Promise<{ data: T; rawText: string; model: string }> {
    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/api/generate`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          system: options.systemInstruction,
          stream: false,
          format: options.responseSchema ? options.responseSchema : "json",
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIProviderError(
          `Ollama API returned HTTP ${response.status}: ${errorText || response.statusText}`,
          this.name,
          "OLLAMA_HTTP_ERROR",
          response.status
        );
      }

      const json = (await response.json()) as any;
      const rawText = json.response || "";

      try {
        const data = JSON.parse(rawText) as T;
        return { data, rawText, model };
      } catch (parseErr) {
        throw new AIProviderError(
          `Failed to parse Ollama JSON response: ${(parseErr as Error).message}`,
          this.name,
          "INVALID_STRUCTURED_OUTPUT"
        );
      }
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const isAbort = (err as any)?.name === "AbortError";
      throw new AIProviderError(
        isAbort ? "Request timed out" : (err instanceof Error ? err.message : String(err)),
        this.name,
        isAbort ? "OLLAMA_TIMEOUT" : "OLLAMA_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
