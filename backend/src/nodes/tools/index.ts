import type { NodeDefinition } from "../types.js";
import { defaultNodeRegistry } from "../registry.js";
import { GuardrailValidator } from "../../guardrails/guardrail.validator.js";
import type { GuardrailRuleConfig } from "../../guardrails/types.js";

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
  allowLocalNetwork?: boolean;
  timeoutMs?: number;
}

const SSRF_DISALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "169.254.169.254", // AWS/GCP metadata
  "metadata.google.internal",
];

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
      if (!params.config.allowLocalNetwork) {
        if (
          SSRF_DISALLOWED_HOSTS.includes(hostname) ||
          hostname.startsWith("10.") ||
          hostname.startsWith("192.168.")
        ) {
          return {
            success: false,
            error: {
              code: "SSRF_PROHIBITED_HOST",
              message: `Access to private/local network address '${hostname}' is prohibited.`,
            },
          };
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs || 10000);

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
      }
    },
  },
};

/**
 * 3. HumanApprovalGateNode: Human-in-the-loop decision routing.
 */
export interface HumanApprovalConfig {
  approvedByDefault?: boolean;
}

export const humanApprovalGateNodeDefinition: NodeDefinition<
  HumanApprovalConfig,
  { approved?: boolean; payload?: unknown } | unknown,
  unknown
> = {
  manifest: {
    type: "human_approval_gate",
    name: "Human Approval Gate",
    version: "1.0.0",
    description: "Human-in-the-loop validation gate. Routes to 'approved' or 'rejected' branch.",
    category: "logic",
    inputs: [{ id: "input", label: "Payload to Approve" }],
    outputs: [
      { id: "approved", label: "Approved Branch" },
      { id: "rejected", label: "Rejected Branch" },
    ],
    configFields: [
      {
        name: "approvedByDefault",
        label: "Approved by Default",
        type: "boolean",
        required: false,
        defaultValue: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      let isApproved = Boolean(params.config?.approvedByDefault);

      if (params.input && typeof params.input === "object" && "approved" in (params.input as Record<string, unknown>)) {
        isApproved = Boolean((params.input as any).approved);
      }

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
  ];

  for (const node of nodes) {
    if (!registry.has(node.manifest.type)) {
      registry.register(node as any);
    }
  }
}
