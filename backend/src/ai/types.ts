export class AIProviderError extends Error {
  readonly code: string;
  readonly provider: string;
  readonly status?: number;

  constructor(message: string, provider: string, code = "AI_PROVIDER_ERROR", status?: number) {
    super(`[${provider}] ${message}`);
    this.name = "AIProviderError";
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

export interface GenerateTextOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  enableSearch?: boolean;
}

export interface GroundingChunk {
  title?: string;
  uri: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  groundingChunks?: GroundingChunk[];
  usage?: {
    promptTokens?: number;
    candidateTokens?: number;
    totalTokens?: number;
  };
}

export interface GenerateStructuredOptions extends GenerateTextOptions {
  responseSchema?: Record<string, unknown>;
}

export interface AIProvider {
  readonly name: string;
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  generateStructured<T = unknown>(options: GenerateStructuredOptions): Promise<{ data: T; rawText: string; model: string }>;
}

export interface GenerateImageOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  width?: number;
  height?: number;
}

export interface GenerateImageResult {
  imageUrl?: string;
  base64Image?: string;
  model: string;
}
