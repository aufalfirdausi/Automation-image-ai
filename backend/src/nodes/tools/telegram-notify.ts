import type { NodeDefinition } from "../types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface TelegramNotifyConfig {
  botToken?: string;
  chatId?: string;
  caption?: string;
  parseMode?: "Markdown" | "HTML";
}

export interface TelegramNotifyOutput {
  sentMessageId?: number;
  sentMediaGroup?: boolean;
  documentSent?: boolean;
}

function readCarouselPrompts(input: unknown): string[] {
  const candidates = input && typeof input === "object"
    ? [input as Record<string, unknown>, ...Object.values(input as Record<string, unknown>).filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")]
    : [];

  for (const candidate of candidates) {
    const prompts = candidate.carousel_prompts ?? candidate.carouselPrompts;
    if (Array.isArray(prompts)) {
      const values = prompts.filter((prompt): prompt is string => typeof prompt === "string" && prompt.trim().length > 0);
      if (values.length > 0) return values.slice(0, 6);
    }

    if (Array.isArray(candidate.carousel)) {
      const values = candidate.carousel
        .map((slide) => {
          if (typeof slide === "string") return slide;
          if (!slide || typeof slide !== "object") return "";
          const value = slide as Record<string, unknown>;
          return typeof value.image_prompt === "string" ? value.image_prompt : typeof value.prompt === "string" ? value.prompt : "";
        })
        .filter((prompt) => prompt.trim().length > 0);
      if (values.length > 0) return values.slice(0, 6);
    }
  }

  return [];
}

function formatCarouselPrompts(prompts: string[]): string {
  return [
    "*Prompt Carousel — gunakan tema visual sama dengan cover*",
    "Rasio 4:5. Pertahankan gaya pixel-art, palet, karakter, dan komposisi cover.",
    ...prompts.map((prompt, index) => `\n*Slide ${index + 1}*\n${prompt}`),
  ].join("\n");
}

export const telegramNotifyNodeDefinition: NodeDefinition<
  TelegramNotifyConfig,
  unknown,
  TelegramNotifyOutput
> = {
  manifest: {
    type: "telegram_notify",
    name: "Telegram Notification",
    version: "1.0.0",
    description: "Sends Markdown text digests, photo carousels, or document bundles to Telegram.",
    category: "utility",
    inputs: [{ id: "payload", label: "Message / Media Payload" }],
    outputs: [{ id: "result", label: "Telegram Dispatch Result" }],
    configFields: [
      {
        name: "chatId",
        label: "Chat ID",
        type: "string",
        required: false,
        description: "Overrides TELEGRAM_CHAT_ID from environment if provided.",
      },
      {
        name: "caption",
        label: "Fallback Caption",
        type: "string",
        required: false,
      },
      {
        name: "parseMode",
        label: "Parse Mode",
        type: "select",
        required: false,
        defaultValue: "Markdown",
        options: [
          { label: "Markdown", value: "Markdown" },
          { label: "HTML", value: "HTML" },
        ],
      },
    ],
  },
  handler: {
    async execute(params) {
      const config = params.config || {};
      const botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !botToken.trim()) {
        return {
          success: false,
          error: {
            code: "MISSING_TELEGRAM_TOKEN",
            message: "TELEGRAM_BOT_TOKEN is not configured in environment or node config.",
          },
        };
      }

      if (!chatId || !String(chatId).trim()) {
        return {
          success: false,
          error: {
            code: "MISSING_TELEGRAM_CHAT_ID",
            message: "TELEGRAM_CHAT_ID is not configured in environment or node config.",
          },
        };
      }

      const input = params.input;
      const baseUrl = `https://api.telegram.org/bot${botToken.trim()}`;
      const parseMode = config.parseMode || "Markdown";

      // 1. Media Group (carousel photos)
      if (
        input &&
        typeof input === "object" &&
        Array.isArray((input as { images?: unknown }).images) &&
        (input as { images: unknown[] }).images.length > 0
      ) {
        const images = (input as { images: string[]; caption?: string }).images;
        const caption = (input as { caption?: string }).caption || config.caption || "";

        const form = new FormData();
        form.append("chat_id", String(chatId).trim());

        const media: Array<Record<string, unknown>> = [];
        for (let i = 0; i < images.length; i++) {
          const imgPath = images[i];
          const attachName = `photo_${i}`;
          const item: Record<string, unknown> = {
            type: "photo",
            media: `attach://${attachName}`,
          };
          if (i === 0 && caption) {
            item.caption = caption;
            if (parseMode) item.parse_mode = parseMode;
          }
          media.push(item);

          try {
            const fileBuf = await fs.readFile(imgPath);
            const blob = new Blob([fileBuf], { type: "image/png" });
            form.append(attachName, blob, path.basename(imgPath));
          } catch (readErr) {
            return {
              success: false,
              error: {
                code: "ATTACHMENT_READ_FAILED",
                message: `Failed to read media file '${imgPath}': ${(readErr as Error).message}`,
              },
            };
          }
        }

        form.append("media", JSON.stringify(media));

        const res = await fetch(`${baseUrl}/sendMediaGroup`, {
          method: "POST",
          body: form,
          signal: params.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return {
            success: false,
            error: {
              code: "TELEGRAM_HTTP_ERROR",
              message: `Telegram sendMediaGroup failed: ${res.status} ${errText}`,
            },
          };
        }

        return { success: true, output: { sentMediaGroup: true } };
      }

      // 2. Document attachment (ZIP bundle)
      if (
        input &&
        typeof input === "object" &&
        typeof (input as { documentPath?: unknown }).documentPath === "string"
      ) {
        const docPath = (input as { documentPath: string; caption?: string }).documentPath;
        const caption = (input as { caption?: string }).caption || config.caption || "";

        try {
          const fileBuf = await fs.readFile(docPath);
          const form = new FormData();
          form.append("chat_id", String(chatId).trim());
          if (caption) {
            form.append("caption", caption);
            if (parseMode) form.append("parse_mode", parseMode);
          }
          form.append("document", new Blob([fileBuf]), path.basename(docPath));

          const res = await fetch(`${baseUrl}/sendDocument`, {
            method: "POST",
            body: form,
            signal: params.signal,
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return {
              success: false,
              error: {
                code: "TELEGRAM_HTTP_ERROR",
                message: `Telegram sendDocument failed: ${res.status} ${errText}`,
              },
            };
          }

          return { success: true, output: { documentSent: true } };
        } catch (readErr) {
          return {
            success: false,
            error: {
              code: "ATTACHMENT_READ_FAILED",
              message: `Failed to read document '${docPath}': ${(readErr as Error).message}`,
            },
          };
        }
      }

      // 2.5 Single image photo (base64 or URL)
      // Supports direct { base64Image } or multi-input { generate_cover: { base64Image }, generate_blueprint: { telegram_package_markdown } }
      let photoBase64: string | undefined;
      let photoUrl: string | undefined;
      let photoCaptionText = "";

      if (input && typeof input === "object") {
        const obj = input as Record<string, any>;
        // Case A: direct node output
        if (typeof obj.base64Image === "string") {
          photoBase64 = obj.base64Image;
          photoCaptionText = typeof obj.caption === "string" ? obj.caption : "";
        } else if (typeof obj.imageUrl === "string") {
          photoUrl = obj.imageUrl;
          photoCaptionText = typeof obj.caption === "string" ? obj.caption : "";
        }
        // Case B: multi-input merge { nodeA: ..., nodeB: ... }
        for (const val of Object.values(obj)) {
          if (val && typeof val === "object") {
            if (!photoBase64 && typeof val.base64Image === "string") {
              photoBase64 = val.base64Image;
            }
            if (!photoUrl && typeof val.imageUrl === "string") {
              photoUrl = val.imageUrl;
            }
          }
        }
      }

      if (photoBase64 || photoUrl) {
        const form = new FormData();
        form.append("chat_id", String(chatId).trim());
        const caption = (config.caption || photoCaptionText || "🎨 Cover Image Generated").slice(0, 1024);
        form.append("caption", caption);

        if (photoBase64) {
          const buf = Buffer.from(photoBase64, "base64");
          form.append("photo", new Blob([buf], { type: "image/png" }), "cover.png");
        } else if (photoUrl) {
          form.append("photo", photoUrl);
        }

        await fetch(`${baseUrl}/sendPhoto`, {
          method: "POST",
          body: form,
          signal: params.signal,
        });
      }

      // 3. Text Message (digest + carousel prompts)
      let text = "";
      if (typeof input === "string") {
        text = input;
      } else if (input && typeof input === "object") {
        const anyInput = input as Record<string, unknown>;
        if (typeof anyInput.telegram_markdown === "string") {
          text = anyInput.telegram_markdown;
        } else if (typeof anyInput.telegram_package_markdown === "string") {
          text = anyInput.telegram_package_markdown;
        } else if (typeof anyInput.text === "string") {
          text = anyInput.text;
        } else if (typeof anyInput.message === "string") {
          text = anyInput.message;
        } else {
          // Check if any sub-object has telegram markdown (multi-input)
          for (const val of Object.values(anyInput)) {
            if (val && typeof val === "object") {
              const sub = val as Record<string, unknown>;
              if (typeof sub.telegram_package_markdown === "string") {
                text = sub.telegram_package_markdown;
                break;
              }
              if (typeof sub.telegram_markdown === "string") {
                text = sub.telegram_markdown;
                break;
              }
            }
          }
          if (!text) {
            text = JSON.stringify(input, null, 2);
          }
        }
      } else {
        text = config.caption || "";
      }

      const carouselPrompts = readCarouselPrompts(input);
      if (carouselPrompts.length > 0) {
        text = [text, formatCarouselPrompts(carouselPrompts)].filter(Boolean).join("\n\n");
      }

      if (!text.trim()) {
        return {
          success: false,
          error: {
            code: "EMPTY_MESSAGE",
            message: "Cannot send empty Telegram message.",
          },
        };
      }

      // Telegram message limit is 4096 chars; split into chunks if necessary
      const MAX_CHUNK = 4000;
      const chunks: string[] = [];
      if (text.length <= MAX_CHUNK) {
        chunks.push(text);
      } else {
        let remaining = text;
        while (remaining.length > 0) {
          if (remaining.length <= MAX_CHUNK) {
            chunks.push(remaining);
            break;
          }
          // Split at last newline within boundary, else hard cut
          let splitIdx = remaining.lastIndexOf("\n", MAX_CHUNK);
          if (splitIdx < MAX_CHUNK / 2) splitIdx = MAX_CHUNK;
          chunks.push(remaining.slice(0, splitIdx));
          remaining = remaining.slice(splitIdx).replace(/^\n/, "");
        }
      }

      let lastMessageId: number | undefined;
      for (const chunk of chunks) {
        // Attempt with parse_mode first; if Telegram parse fails (unmatched entity), fallback to plain text
        let res = await fetch(`${baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: String(chatId).trim(),
            text: chunk,
            parse_mode: parseMode,
          }),
          signal: params.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (errText.includes("can't parse entities")) {
            res = await fetch(`${baseUrl}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: String(chatId).trim(),
                text: chunk,
              }),
              signal: params.signal,
            });
          } else {
            return {
              success: false,
              error: {
                code: "TELEGRAM_HTTP_ERROR",
                message: `Telegram sendMessage failed: ${res.status} ${errText}`,
              },
            };
          }
        }

        if (!res.ok) {
          const finalErr = await res.text().catch(() => "");
          return {
            success: false,
            error: {
              code: "TELEGRAM_HTTP_ERROR",
              message: `Telegram sendMessage fallback failed: ${res.status} ${finalErr}`,
            },
          };
        }

        const json = (await res.json().catch(() => ({}))) as { result?: { message_id?: number } };
        lastMessageId = json.result?.message_id;
      }

      return {
        success: true,
        output: { sentMessageId: lastMessageId },
      };
    },
  },
};
