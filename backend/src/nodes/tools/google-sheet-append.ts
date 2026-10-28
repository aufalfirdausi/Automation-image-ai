import type { NodeDefinition } from "../types.js";

export interface GoogleSheetAppendConfig {
  webhookUrl?: string;
  wave?: string;
}

export const googleSheetAppendNodeDefinition: NodeDefinition<
  GoogleSheetAppendConfig,
  unknown,
  { success: boolean; status?: number; response?: unknown }
> = {
  manifest: {
    type: "google_sheet_append",
    name: "Google Sheet Append",
    version: "1.0.0",
    description: "Appends generated content rows directly into Google Sheet via Apps Script Webhook.",
    category: "action",
    inputs: [{ id: "input", label: "Payload with content fields" }],
    outputs: [{ id: "output", label: "Append Result" }],
    configFields: [
      {
        name: "webhookUrl",
        label: "Apps Script Webhook URL",
        type: "string",
        required: false,
        description: "Google Apps Script Web App URL ending with /exec. Falls back to GOOGLE_SHEET_WEBHOOK_URL env.",
      },
      {
        name: "wave",
        label: "Wave Name",
        type: "string",
        required: false,
        defaultValue: "Wave 2",
      },
    ],
  },
  handler: {
    async execute(params) {
      const webhookUrl =
        params.config?.webhookUrl ||
        process.env.GOOGLE_SHEET_WEBHOOK_URL ||
        "";

      if (!webhookUrl) {
        return {
          success: false,
          error: {
            code: "MISSING_SHEET_WEBHOOK_URL",
            message: "GOOGLE_SHEET_WEBHOOK_URL is not configured in environment or node config.",
          },
        };
      }

      // Extract fields from single object or merged multi-input object
      const input = params.input as any;
      let topic = "";
      let hook = "";
      let caption = "";
      let image = "";

      const checkCandidate = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        if (!topic && obj.topic_title) topic = String(obj.topic_title);
        if (!topic && obj.topic) topic = String(obj.topic);
        if (!hook && obj.reels_script?.hook_3s) hook = String(obj.reels_script.hook_3s);
        if (!hook && obj.hook) hook = String(obj.hook);
        if (!caption && obj.instagram_caption?.caption_body) {
          caption = `${obj.instagram_caption.caption_body}\n\n${obj.instagram_caption.hashtags || ""}`.trim();
        }
        if (!caption && obj.caption) caption = String(obj.caption);
        if (!caption && obj.telegram_package_markdown) caption = String(obj.telegram_package_markdown).slice(0, 500);
        if (!image && (obj.base64Image || obj.imageUrl)) {
          image = obj.imageUrl ? String(obj.imageUrl) : "generated_pixel_art.png";
        }
      };

      checkCandidate(input);
      if (typeof input === "object" && input !== null) {
        for (const val of Object.values(input)) {
          checkCandidate(val);
        }
      }

      const wave = params.config?.wave || "Wave 2";

      // Calculate topic repetition/duration from run events history or payload
      let duration = "Day 2/3 (Rotate in 1 day)";
      if (typeof input === "object" && input !== null) {
        if (input.duration) duration = String(input.duration);
      }

      const payload = {
        wave,
        topic: topic || "Automated Content Run",
        hook: hook || "-",
        caption: caption || "-",
        image: image || "generated_pixel_art.png",
        status: "Ready",
        duration,
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: params.signal,
        });
        const text = await response.text().catch(() => "");
        if (!response.ok) {
          return {
            success: false,
            error: {
              code: "SHEET_APPEND_ERROR",
              message: `Google Sheet append failed with HTTP ${response.status}: ${text}`,
            },
          };
        }
        return { success: true, output: { success: true, status: response.status, response: text } };
      } catch (error) {
        return {
          success: false,
          error: {
            code: error instanceof Error && error.name === "AbortError" ? "SHEET_APPEND_ABORTED" : "SHEET_APPEND_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  },
};
