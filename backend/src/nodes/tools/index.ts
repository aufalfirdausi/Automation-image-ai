import type { NodeDefinition } from "../types.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { defaultNodeRegistry } from "../registry.js";
import { GuardrailValidator } from "../../guardrails/guardrail.validator.js";
import type { GuardrailRuleConfig } from "../../guardrails/types.js";
import {
  telegramNotifyNodeDefinition,
  type TelegramNotifyConfig,
  type TelegramNotifyOutput,
} from "./telegram-notify.js";
import {
  googleSheetAppendNodeDefinition,
  type GoogleSheetAppendConfig,
} from "./google-sheet-append.js";

export {
  telegramNotifyNodeDefinition,
  type TelegramNotifyConfig,
  type TelegramNotifyOutput,
  googleSheetAppendNodeDefinition,
  type GoogleSheetAppendConfig,
};

/**
 * 1. AIGuardrailNode: validates AI output against safety patterns, string limits, and schemas.
 */
export interface AIGuardrailConfig extends GuardrailRuleConfig {
  failFast?: boolean;
}

export const aiGuardrailNodeDefinition: NodeDefinition<
  AIGuardrailConfig,
  unknown,
  unknown
> = {
  manifest: {
    type: "ai_guardrail",
    name: "AI Output Guardrail",
    version: "1.0.0",
    description: "Evaluates AI output against safety blocklists, size limits, and schema structure.",
    category: "logic",
    inputs: [{ id: "input", label: "AI Output to Validate" }],
    outputs: [
      { id: "valid", label: "Valid Output" },
      { id: "invalid", label: "Violation Details" },
    ],
    configFields: [
      {
        name: "failFast",
        label: "Fail Fast",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "If true, halts the workflow immediately on violation.",
      },
      {
        name: "maxStringLength",
        label: "Max String Length",
        type: "number",
        required: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      const validation = GuardrailValidator.validate(params.input, params.config);

      if (!validation.isValid) {
        if (params.config?.failFast) {
          return {
            success: false,
            error: {
              code: "GUARDRAIL_VIOLATION",
              message: `Guardrail safety check failed: ${validation.violations.map((v) => v.message).join("; ")}`,
              details: validation.violations,
            },
          };
        }

        return {
          success: true,
          output: {
            isValid: false,
            violations: validation.violations,
            originalInput: params.input,
          },
          branch: "invalid",
        };
      }

      return {
        success: true,
        output: params.input,
        branch: "valid",
      };
    },
  },
};

/**
 * 2. ControlledHttpRequestNode: Anti-SSRF protected external HTTP dispatch.
 */
export interface ControlledHttpConfig {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const SSRF_DISALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "169.254.169.254", // AWS/GCP metadata
  "metadata.google.internal",
];

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.")
  );
}

async function isProhibitedRequestTarget(hostname: string): Promise<boolean> {
  if (SSRF_DISALLOWED_HOSTS.includes(hostname) || isPrivateIpAddress(hostname)) {
    return true;
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address));
  } catch {
    return true;
  }
}

export const controlledHttpRequestNodeDefinition: NodeDefinition<
  ControlledHttpConfig,
  unknown,
  unknown
> = {
  manifest: {
    type: "controlled_http_request",
    name: "Controlled HTTP Request",
    version: "1.0.0",
    description: "Anti-SSRF protected HTTP client for safe external integrations.",
    category: "utility",
    inputs: [{ id: "body", label: "Request Body (Optional)" }],
    outputs: [{ id: "response", label: "HTTP Response" }],
    configFields: [
      {
        name: "url",
        label: "Target URL",
        type: "string",
        required: true,
      },
      {
        name: "method",
        label: "HTTP Method",
        type: "select",
        required: false,
        defaultValue: "POST",
        options: [
          { label: "POST", value: "POST" },
          { label: "GET", value: "GET" },
        ],
      },
    ],
  },
  handler: {
    async execute(params) {
      const urlStr = params.config.url;
      if (!urlStr || typeof urlStr !== "string") {
        return {
          success: false,
          error: { code: "INVALID_URL", message: "Target URL is required" },
        };
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch {
        return {
          success: false,
          error: { code: "MALFORMED_URL", message: `Invalid URL format: ${urlStr}` },
        };
      }

      // SSRF Protection: verify protocol and hostname
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return {
          success: false,
          error: {
            code: "FORBIDDEN_PROTOCOL",
            message: `Protocol '${parsedUrl.protocol}' is forbidden. Only HTTP/HTTPS allowed.`,
          },
        };
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      if (await isProhibitedRequestTarget(hostname)) {
        return {
          success: false,
          error: {
            code: "SSRF_PROHIBITED_HOST",
            message: `Access to private/local network address '${hostname}' is prohibited.`,
          },
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs || 10000);
      const abortFromWorkflow = () => controller.abort();
      params.signal?.addEventListener("abort", abortFromWorkflow, { once: true });

      try {
        const method = params.config.method || "POST";
        const hasBody = method !== "GET" && params.input !== undefined && params.input !== null;

        const response = await fetch(parsedUrl.toString(), {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(params.config.headers || {}),
          },
          body: hasBody ? (typeof params.input === "string" ? params.input : JSON.stringify(params.input)) : undefined,
          signal: controller.signal,
          redirect: "manual",
        });

        const status = response.status;
        let responseData: unknown = null;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          responseData = await response.json().catch(() => null);
        } else {
          responseData = await response.text().catch(() => "");
        }

        if (!response.ok) {
          if (response.status >= 300 && response.status < 400) {
            return {
              success: false,
              error: {
                code: "REDIRECT_NOT_ALLOWED",
                message: "HTTP redirects are not allowed for controlled requests.",
              },
            };
          }
          return {
            success: false,
            error: {
              code: "HTTP_STATUS_ERROR",
              message: `HTTP request failed with status ${status}`,
              details: { status, data: responseData },
            },
          };
        }

        return {
          success: true,
          output: { status, data: responseData },
        };
      } catch (err) {
        const isAbort = (err as any)?.name === "AbortError";
        return {
          success: false,
          error: {
            code: isAbort ? "HTTP_TIMEOUT" : "HTTP_NETWORK_ERROR",
            message: isAbort ? "HTTP request timed out" : (err instanceof Error ? err.message : String(err)),
          },
        };
      } finally {
        clearTimeout(timeout);
        params.signal?.removeEventListener("abort", abortFromWorkflow);
      }
    },
  },
};

/**
 * 3. HumanApprovalGateNode: Human-in-the-loop decision routing.
 */
export const humanApprovalGateNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  { approved?: boolean; payload?: unknown } | unknown,
  unknown
> = {
  manifest: {
    type: "human_approval_gate",
    name: "Explicit Approval Gate",
    version: "1.0.0",
    description: "Routes an explicitly supplied approval decision to the approved or rejected branch.",
    category: "logic",
    inputs: [{ id: "input", label: "Payload to Approve" }],
    outputs: [
      { id: "approved", label: "Approved Branch" },
      { id: "rejected", label: "Rejected Branch" },
    ],
    configFields: [],
  },
  handler: {
    async execute(params) {
      const approvalInput = params.input as { approved?: unknown } | null;
      if (
        !approvalInput ||
        typeof approvalInput !== "object" ||
        !Object.prototype.hasOwnProperty.call(approvalInput, "approved") ||
        typeof approvalInput.approved !== "boolean"
      ) {
        return {
          success: false,
          error: {
            code: "APPROVAL_DECISION_REQUIRED",
            message: "Approval input must contain an explicit boolean 'approved' decision.",
          },
        };
      }

      const isApproved = approvalInput.approved;

      const branch = isApproved ? "approved" : "rejected";
      return {
        success: true,
        output: {
          approved: isApproved,
          payload: params.input,
        },
        branch,
      };
    },
  },
};

export function registerToolNodes(registry = defaultNodeRegistry): void {
  const nodes = [
    aiGuardrailNodeDefinition,
    controlledHttpRequestNodeDefinition,
    humanApprovalGateNodeDefinition,
    telegramNotifyNodeDefinition,
    googleSheetAppendNodeDefinition,
  ];

  for (const node of nodes) {
    if (!registry.has(node.manifest.type)) {
      registry.register(node as any);
    }
  }
}
