import { AIProviderError, type AIProvider, type GenerateTextOptions, type GenerateTextResult, type GenerateStructuredOptions, type GenerateImageOptions, type GenerateImageResult } from "./types.js";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string;
  private imageApiKey: string;
  private defaultModel: string;
  private defaultImageModel: string;
  private textBaseUrl: string;
  private imageBaseUrl: string;

  constructor(options?: {
    apiKey?: string;
    imageApiKey?: string;
    defaultModel?: string;
    defaultImageModel?: string;
    baseUrl?: string;
    imageBaseUrl?: string;
  }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || "";
    this.imageApiKey =
      options?.imageApiKey ||
      process.env.GEMINI_IMAGE_API_KEY ||
      this.apiKey;
    this.defaultModel = options?.defaultModel || process.env.GEMINI_DEFAULT_MODEL || "gemini-3.5-flash";
    this.defaultImageModel = options?.defaultImageModel || process.env.GEMINI_IMAGE_MODEL || "ag/gemini-3.1-flash-image";
    // Text API calls Google Gemini directly
    this.textBaseUrl = "https://generativelanguage.googleapis.com";
    // Image API calls local 9Router OpenAI-compatible endpoint
    this.imageBaseUrl = (options?.imageBaseUrl || process.env.GEMINI_BASE_URL || "http://localhost:20128/v1").replace(/\/$/, "");
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", this.name, "MISSING_API_KEY");
    }

    const model = options.model || this.defaultModel;
    const url = `${this.textBaseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 120000);
    const abortFromWorkflow = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromWorkflow, { once: true });

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };

    if (options.enableSearch) {
      body.tools = [{ google_search: {} }];
    }

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
      const textParts = (candidate?.content?.parts || []) as Array<{ text?: string }>;
      const text = textParts.map((p) => p.text || "").join("");

      const rawChunks = candidate?.groundingMetadata?.groundingChunks || [];
      const groundingChunks = Array.isArray(rawChunks)
        ? rawChunks
            .map((c: any) => ({
              title: c?.web?.title as string | undefined,
              uri: (c?.web?.uri || "") as string,
            }))
            .filter((c: { uri: string }) => Boolean(c.uri))
        : undefined;

      return {
        text,
        model,
        groundingChunks: groundingChunks && groundingChunks.length > 0 ? groundingChunks : undefined,
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
      options.signal?.removeEventListener("abort", abortFromWorkflow);
    }
  }

  async generateStructured<T = unknown>(
    options: GenerateStructuredOptions
  ): Promise<{ data: T; rawText: string; model: string }> {
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", this.name, "MISSING_API_KEY");
    }

    const model = options.model || this.defaultModel;
    const url = `${this.textBaseUrl}/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 180000);
    const abortFromWorkflow = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromWorkflow, { once: true });

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

    const maxAttempts = 5;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const isRetryable = response.status === 503 || response.status === 429;
          if (isRetryable && attempt < maxAttempts) {
            const delayMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
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
        lastError = err;
        const isRetryable =
          err instanceof AIProviderError &&
          (err.status === 503 || err.status === 429);
        if (isRetryable && attempt < maxAttempts) {
          const delayMs = 2000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        break;
      }
    }

    try {
      if (lastError instanceof AIProviderError) throw lastError;
      const isAbort = (lastError as any)?.name === "AbortError";
      throw new AIProviderError(
        isAbort ? "Request timed out" : (lastError instanceof Error ? lastError.message : String(lastError)),
        this.name,
        isAbort ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromWorkflow);
    }
  }

  async generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
    const key = this.imageApiKey;
    if (!key) {
      throw new AIProviderError("GEMINI_IMAGE_API_KEY is not configured", this.name, "MISSING_API_KEY");
    }

    const model = options.model || this.defaultImageModel;
    const url = `${this.imageBaseUrl}/images/generations`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 120000);
    const abortFromWorkflow = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromWorkflow, { once: true });

    const body: Record<string, unknown> = {
      model,
      prompt: options.prompt,
      n: 1,
      size: `${options.width || 1080}x${options.height || 1350}`,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AIProviderError(
          `Gemini Image API returned HTTP ${response.status}: ${errorText || response.statusText}`,
          this.name,
          "GEMINI_IMAGE_HTTP_ERROR",
          response.status
        );
      }

      const json = (await response.json()) as any;
      const firstItem = json.data?.[0];
      const base64Image = firstItem?.b64_json || firstItem?.b64;
      const imageUrl = firstItem?.url;

      if (!base64Image && !imageUrl) {
        throw new AIProviderError(
          "No image data returned from image generation endpoint",
          this.name,
          "GEMINI_IMAGE_NO_DATA"
        );
      }

      return {
        base64Image,
        imageUrl,
        model,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      const isAbort = (err as any)?.name === "AbortError";
      throw new AIProviderError(
        isAbort ? "Request timed out" : (err instanceof Error ? err.message : String(err)),
        this.name,
        isAbort ? "GEMINI_IMAGE_TIMEOUT" : "GEMINI_IMAGE_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromWorkflow);
    }
  }
}
