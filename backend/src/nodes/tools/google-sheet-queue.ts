import type { NodeDefinition } from "../types.js";

export interface GoogleSheetQueueReadConfig {
  webhookUrl?: string;
  wave?: string;
  date?: string;
}

export interface GoogleSheetQueueReadOutput {
  found: boolean;
  rowIndex?: number;
  date?: string;
  wave?: string;
  topic?: string;
  brief?: string;
  status?: string;
  seedPrompt?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const abortFromWorkflow = () => controller.abort();
  signal?.addEventListener("abort", abortFromWorkflow, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromWorkflow);
  }
}

export const googleSheetQueueReadNodeDefinition: NodeDefinition<
  GoogleSheetQueueReadConfig,
  unknown,
  GoogleSheetQueueReadOutput
> = {
  manifest: {
    type: "google_sheet_queue_read",
    name: "Google Sheet Queue Reader",
    version: "1.0.0",
    description: "Reads next pending or date-matched topic from the Google Sheet Content Queue.",
    category: "action",
    inputs: [{ id: "input", label: "Optional Trigger Input (date/wave override)" }],
    outputs: [{ id: "output", label: "Queue Item Details" }],
    configFields: [
      {
        name: "webhookUrl",
        label: "Queue Webhook URL",
        type: "string",
        required: false,
        description: "Google Apps Script Web App URL for Queue tab. Falls back to GOOGLE_SHEET_QUEUE_URL env.",
      },
      {
        name: "wave",
        label: "Wave Filter",
        type: "string",
        required: false,
        description: "e.g. 'Wave 1' or 'Wave 2'. Defaults from runtime trigger if available.",
      },
      {
        name: "date",
        label: "Date Filter",
        type: "string",
        required: false,
        description: "YYYY-MM-DD format. Defaults from runtime trigger or today.",
      },
    ],
  },
  handler: {
    async execute(params) {
      const webhookUrl = params.config?.webhookUrl || process.env.GOOGLE_SHEET_QUEUE_URL || "";
      if (!webhookUrl) {
        return {
          success: false,
          error: {
            code: "MISSING_QUEUE_WEBHOOK_URL",
            message: "GOOGLE_SHEET_QUEUE_URL is not configured in environment or node config.",
          },
        };
      }

      const input = (params.input as Record<string, unknown>) || {};
      const metadata = (params.context.metadata?.triggerPayload as Record<string, unknown>) || {};
      const wave =
        params.config?.wave ||
        (typeof input.wave === "string" ? input.wave : undefined) ||
        (typeof metadata.wave === "string" ? metadata.wave : undefined) ||
        "Wave 2";
      const date =
        params.config?.date ||
        (typeof input.date === "string" ? input.date : undefined) ||
        (typeof metadata.date === "string" ? metadata.date : undefined) ||
        "";

      let queryUrl: URL;
      try {
        queryUrl = new URL(webhookUrl);
      } catch {
        return {
          success: false,
          error: { code: "INVALID_QUEUE_WEBHOOK_URL", message: "Queue webhook URL is invalid." },
        };
      }
      queryUrl.searchParams.set("wave", wave);
      if (date) queryUrl.searchParams.set("date", date);

      try {
        const response = await fetchWithTimeout(queryUrl.toString(), { method: "GET" }, params.signal);
        if (!response.ok) {
          return {
            success: false,
            error: {
              code: "QUEUE_FETCH_ERROR",
              message: `HTTP error fetching queue: ${response.status} ${response.statusText}`,
            },
          };
        }

        const json = (await response.json()) as {
          status?: string;
          found?: boolean;
          rowIndex?: number;
          data?: Record<string, unknown>;
        };
        if (json.status !== "success" || !json.found || !json.data) {
          return {
            success: false,
            error: {
              code: "QUEUE_ITEM_NOT_FOUND",
              message: `No matching pending queue item found for wave='${wave}' date='${date || "any"}'`,
              details: json,
            },
          };
        }

        const topic = String(json.data.topic || "").trim();
        const brief = String(json.data.brief || "").trim();
        return {
          success: true,
          output: {
            found: true,
            rowIndex: json.rowIndex,
            date: typeof json.data.date === "string" ? json.data.date : undefined,
            wave: typeof json.data.wave === "string" ? json.data.wave : undefined,
            topic,
            brief,
            status: typeof json.data.status === "string" ? json.data.status : undefined,
            seedPrompt: brief ? `Topik: ${topic}\nBrief / Angle: ${brief}` : topic,
          },
        };
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        return {
          success: false,
          error: {
            code: isAbort ? "QUEUE_TIMEOUT" : "QUEUE_REQUEST_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  },
};

export interface GoogleSheetQueueUpdateConfig {
  webhookUrl?: string;
  status?: string;
}

export const googleSheetQueueUpdateNodeDefinition: NodeDefinition<
  GoogleSheetQueueUpdateConfig,
  unknown,
  { success: boolean; message?: string }
> = {
  manifest: {
    type: "google_sheet_queue_update",
    name: "Google Sheet Queue Status Update",
    version: "1.0.0",
    description: "Updates row status in Google Sheet Content Queue (e.g. to DONE).",
    category: "action",
    inputs: [{ id: "input", label: "Payload with rowIndex and status" }],
    outputs: [{ id: "output", label: "Update Result" }],
    configFields: [
      { name: "webhookUrl", label: "Queue Webhook URL", type: "string", required: false },
      { name: "status", label: "Target Status", type: "string", required: false, defaultValue: "DONE" },
    ],
  },
  handler: {
    async execute(params) {
      const webhookUrl = params.config?.webhookUrl || process.env.GOOGLE_SHEET_QUEUE_URL || "";
      if (!webhookUrl) {
        return {
          success: false,
          error: {
            code: "MISSING_QUEUE_WEBHOOK_URL",
            message: "GOOGLE_SHEET_QUEUE_URL is not configured in environment or node config.",
          },
        };
      }

      const input = (params.input as Record<string, unknown>) || {};
      const rowIndex =
        typeof input.rowIndex === "number"
          ? input.rowIndex
          : Object.values(input).find(
              (value): value is { rowIndex: number } =>
                Boolean(value) && typeof value === "object" && typeof (value as { rowIndex?: unknown }).rowIndex === "number"
            )?.rowIndex;
      if (!rowIndex || rowIndex <= 1) {
        return {
          success: false,
          error: { code: "INVALID_QUEUE_ROW", message: "No valid rowIndex found in input payload." },
        };
      }

      try {
        const response = await fetchWithTimeout(
          webhookUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rowIndex, status: params.config?.status || "DONE" }),
          },
          params.signal
        );
        if (!response.ok) {
          return {
            success: false,
            error: { code: "QUEUE_UPDATE_ERROR", message: `Queue update failed with HTTP ${response.status}.` },
          };
        }
        return { success: true, output: { success: true, message: "Queue updated" } };
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        return {
          success: false,
          error: {
            code: isAbort ? "QUEUE_TIMEOUT" : "QUEUE_UPDATE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  },
};
