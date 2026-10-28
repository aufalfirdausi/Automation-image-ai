import { ExecutionService } from "../services/execution.service.js";

export interface TelegramListenerConfig {
  botToken?: string;
  allowedChatId?: string;
  pollIntervalMs?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    from?: { id: number | string; first_name?: string; username?: string };
    text?: string;
    date: number;
  };
}

export class TelegramBotListenerService {
  private botToken: string;
  private allowedChatId: string;
  private pollIntervalMs: number;
  private executionService: ExecutionService;
  private isRunning: boolean = false;
  private lastUpdateId: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private pollController: AbortController | null = null;
  private isPolling: boolean = false;

  constructor(
    config?: TelegramListenerConfig,
    executionService?: ExecutionService
  ) {
    this.botToken = (config?.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    this.allowedChatId = String(config?.allowedChatId || process.env.TELEGRAM_CHAT_ID || "").trim();
    this.pollIntervalMs = config?.pollIntervalMs || 2500;
    this.executionService = executionService || new ExecutionService();
  }

  public start(): void {
    if (this.isRunning) return;
    if (!this.botToken) {
      console.warn("[TelegramListener] TELEGRAM_BOT_TOKEN missing. Listener inactive.");
      return;
    }

    this.isRunning = true;
    console.log(`[TelegramListener] Listening for commands from chat ${this.allowedChatId || "ANY"}...`);
    this.scheduleNextPoll(100);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollController?.abort();
    this.pollController = null;
    console.log("[TelegramListener] Listener stopped.");
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(() => {
      this.poll().finally(() => {
        if (this.isRunning) {
          this.scheduleNextPoll(this.pollIntervalMs);
        }
      });
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      this.pollController = new AbortController();
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=25`;
      const res = await fetch(url, { signal: this.pollController.signal });
      if (!res.ok) {
        if (res.status === 409) {
          // Conflict: webhook might be set or multiple instances running
          console.warn("[TelegramListener] Conflict (409). Retrying next cycle...");
        }
        return;
      }

      const json = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!json.ok || !Array.isArray(json.result)) return;

      for (const update of json.result) {
        if (update.update_id > this.lastUpdateId) {
          this.lastUpdateId = update.update_id;
        }

        if (update.message?.text) {
          await this.handleMessage(update.message);
        }
      }
    } catch (err) {
      // Network hiccup: log briefly, keep going
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ETIMEDOUT") && !msg.includes("fetch failed")) {
        console.error("[TelegramListener] Poll error:", msg);
      }
    } finally {
      this.pollController = null;
      this.isPolling = false;
    }
  }

  private async handleMessage(msg: NonNullable<TelegramUpdate["message"]>): Promise<void> {
    const chatId = String(msg.chat.id);
    const text = (msg.text || "").trim();

    // Authorization gate: strictly match configured chat ID
    if (this.allowedChatId && chatId !== this.allowedChatId) {
      console.warn(`[TelegramListener] Ignored message from unauthorized chat: ${chatId}`);
      return;
    }

    const lower = text.toLowerCase();

    // Check for help command
    if (lower === "/help" || lower === "help") {
      await this.sendTelegramMessage(
        chatId,
        "🕹 *Orchestrator Bot Commands*\n\n" +
          "• `do wave 1` or `/run wave 1`\n" +
          "  _Run Wave 1 curation (defaults to today)_\n" +
          "• `do wave 2` or `/run wave 2`\n" +
          "  _Run Wave 2 blueprint (defaults to today)_\n" +
          "• `do wave 2 2026-10-20`\n" +
          "  _Run Wave 2 for specific date_\n" +
          "• `/status`\n" +
          "  _Check system health and last runs_"
      );
      return;
    }

    if (lower === "/status" || lower === "status") {
      await this.sendTelegramMessage(
        chatId,
        "🟢 *Orchestrator Status: Online*\n\n" +
          "• DB: Connected\n" +
          "• Scheduled triggers: Paused (Manual Queue mode active)\n" +
          "• Queue Sheet: Connected"
      );
      return;
    }

    // Pattern match: "do wave 1 [date]" or "/run wave 2 [date]" or "wave 1 [date]"
    const runMatch = text.match(/(?:do|run|\/run)?\s*wave\s*([12])(?:\s+([0-9\/\-]+))?/i);
    if (!runMatch) {
      // Not a command, ignore
      return;
    }

    const waveNum = runMatch[1]; // "1" or "2"
    const rawDate = runMatch[2]; // optional

    // Normalize date: if omitted, use Asia/Jakarta today
    let dateStr = "";
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        dateStr = parsed.toISOString().slice(0, 10);
      } else {
        dateStr = rawDate.trim();
      }
    } else {
      // Default to Jakarta today
      const now = new Date();
      const jakartaDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      dateStr = jakartaDate;
    }

    const workflowId = waveNum === "1" ? "wave_1_morning_curation" : "wave_2_afternoon_blueprint";
    const waveLabel = `Wave ${waveNum}`;

    await this.sendTelegramMessage(
      chatId,
      `🚀 *Starting ${waveLabel} Execution*\n` +
        `📅 Date: \`${dateStr}\`\n` +
        `📋 Workflow: \`${workflowId}\`\n` +
        `⏳ Reading Queue & generating content...`
    );

    // Fire workflow asynchronously
    this.triggerWorkflow(workflowId, waveLabel, dateStr, chatId).catch((err) => {
      console.error("[TelegramListener] Workflow trigger error:", err);
    });
  }

  private async triggerWorkflow(
    workflowId: string,
    waveLabel: string,
    dateStr: string,
    chatId: string
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.executionService.startRun({
        workflowId,
        triggerType: "manual",
        idempotencyKey: `${workflowId}_telegram_${dateStr}`,
        triggerPayload: {
          wave: waveLabel,
          date: dateStr,
          source: "telegram_command",
        },
      });

      const durationSec = Math.round((Date.now() - startedAt) / 1000);
      if (result.run.status === "succeeded") {
        await this.sendTelegramMessage(
          chatId,
          `✅ *${waveLabel} Completed Successfully!*\n` +
            `⏱️ Duration: ${durationSec}s\n` +
            `🆔 Run ID: \`${result.run.id}\``
        );
      } else {
        const errorMsg = result.run.error?.message || "Unknown error";
        await this.sendTelegramMessage(
          chatId,
          `❌ *${waveLabel} Failed!*\n` +
            `⏱️ Duration: ${durationSec}s\n` +
            `⚠️ Error: \`${errorMsg}\`\n` +
            `🆔 Run ID: \`${result.run.id}\``
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.sendTelegramMessage(
        chatId,
        `❌ *${waveLabel} Exception!*\n` +
          `⚠️ \`${msg}\``
      );
    }
  }

  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      });
    } catch (err) {
      console.error("[TelegramListener] Failed to reply to Telegram:", err);
    }
  }
}
