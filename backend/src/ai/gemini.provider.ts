import { AIProviderError, type AIProvider, type GenerateTextOptions, type GenerateTextResult, type GenerateStructuredOptions } from "./types.js";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; defaultModel?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || "";
    this.defaultModel = options?.defaultModel || process.env.GEMINI_DEFAULT_MODEL || "gemini-1.5-flash";
    this.baseUrl = (options?.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", this.name, "MISSING_API_KEY");
    }

    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIProviderError(
          `Gemini API returned HTTP ${response.status}: ${errorText || response.statusText}`,
          this.name,
          "GEMINI_HTTP_ERROR",
          response.status
        );
      }

      const json = (await response.json()) as any;
      const candidate = json.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";

      return {
        text,
        model,
        usage: {
          promptTokens: json.usageMetadata?.promptTokenCount,
          candidateTokens: json.usageMetadata?.candidatesTokenCount,
          totalTokens: json.usageMetadata?.totalTokenCount,
        },
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const isAbort = (err as any)?.name === "AbortError";
      throw new AIProviderError(
        isAbort ? "Request timed out" : (err instanceof Error ? err.message : String(err)),
        this.name,
        isAbort ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructured<T = unknown>(
    options: GenerateStructuredOptions
  ): Promise<{ data: T; rawText: string; model: string }> {
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", this.name, "MISSING_API_KEY");
    }

    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    };

    if (options.responseSchema) {
      generationConfig.responseSchema = options.responseSchema;
    }

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig,
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIProviderError(
          `Gemini API returned HTTP ${response.status}: ${errorText || response.statusText}`,
          this.name,
          "GEMINI_HTTP_ERROR",
          response.status
        );
      }

      const json = (await response.json()) as any;
      const candidate = json.candidates?.[0];
      const rawText = candidate?.content?.parts?.[0]?.text || "{}";

      try {
        const data = JSON.parse(rawText) as T;
        return { data, rawText, model };
      } catch (parseErr) {
        throw new AIProviderError(
          `Failed to parse Gemini structured JSON: ${(parseErr as Error).message}`,
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
        isAbort ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
