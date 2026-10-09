import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { GuardrailValidator } from "../src/guardrails/guardrail.validator.js";
import { executeWorkflow } from "../src/engine/runner.js";
import {
  defaultNodeRegistry,
  registerCoreNodes,
  registerAINodes,
  registerToolNodes,
} from "../src/nodes/index.js";
import type { Workflow } from "../src/engine/types.js";

describe("Phase 8: AI Automation, Guardrails & Controlled Tools Tests", () => {
  before(() => {
    registerCoreNodes();
    registerAINodes();
    registerToolNodes();
  });

  describe("GuardrailValidator Unit Tests", () => {
    it("detects and blocks dangerous code execution patterns", () => {
      const dangerousPayloads = [
        "Please execute eval(malicious_code)",
        "<script>window.location='http://evil.com'</script>",
        "const p = exec('whoami')",
        "run command: rm -rf /",
      ];

      for (const payload of dangerousPayloads) {
        const res = GuardrailValidator.validate(payload);
        assert.equal(res.isValid, false, `Expected '${payload}' to be flagged as unsafe`);
        assert.equal(res.violations[0].type, "SAFETY_BLOCKED");
      }
    });

    it("enforces schema required fields and type boundaries", () => {
      const invalidData = { name: "Product A", price: "one hundred" };
      const rules = {
        requiredFields: ["name", "price", "sku"],
        allowedTypes: {
          name: "string" as const,
          price: "number" as const,
          sku: "string" as const,
        },
      };

      const res = GuardrailValidator.validate(invalidData, rules);
      assert.equal(res.isValid, false);
      assert.equal(res.violations.length, 2); // missing sku, wrong type for price
      assert.ok(res.violations.some((v) => v.field === "sku" && v.type === "SCHEMA_MISMATCH"));
      assert.ok(res.violations.some((v) => v.field === "price" && v.type === "SCHEMA_MISMATCH"));
    });

    it("passes completely clean and schema-compliant data", () => {
      const cleanData = { name: "Product A", price: 100, sku: "SKU-1234" };
      const rules = {
        requiredFields: ["name", "price", "sku"],
        allowedTypes: {
          name: "string" as const,
          price: "number" as const,
          sku: "string" as const,
        },
        maxStringLength: 50,
      };

      const res = GuardrailValidator.validate(cleanData, rules);
      assert.equal(res.isValid, true);
      assert.equal(res.violations.length, 0);
    });
  });

  describe("AI Guardrail Node Execution", () => {
    it("halts workflow with fail-fast on safety violation", async () => {
      const workflow: Workflow = {
        id: "wf_guardrail_fail",
        name: "Guardrail Fail Fast",
        nodes: [
          {
            id: "unsafe_source",
            type: "static_value",
            config: { value: "Payload containing eval('bad')" },
          },
          {
            id: "guardrail_check",
            type: "ai_guardrail",
            config: { failFast: true },
          },
        ],
        edges: [{ source: "unsafe_source", target: "guardrail_check" }],
      };

      const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
      assert.equal(summary.status, "failed");
      assert.equal(summary.error?.code, "GUARDRAIL_VIOLATION");
    });

    it("routes cleanly to valid branch when payload passes checks", async () => {
      const workflow: Workflow = {
        id: "wf_guardrail_pass",
        name: "Guardrail Pass Route",
        nodes: [
          {
            id: "safe_source",
            type: "static_value",
            config: { value: { message: "Clean summary text", count: 5 } },
          },
          {
            id: "guardrail_check",
            type: "ai_guardrail",
            config: {
              failFast: false,
              requiredFields: ["message", "count"],
            },
          },
        ],
        edges: [{ source: "safe_source", target: "guardrail_check" }],
      };

      const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
      assert.equal(summary.status, "completed");
      assert.deepEqual(summary.context.nodeOutputs["guardrail_check"], {
        message: "Clean summary text",
        count: 5,
      });
    });
  });

  describe("Controlled HTTP Request Node (Anti-SSRF)", () => {
    it("strictly blocks SSRF attempts against localhost, 127.0.0.1 and cloud metadata", async () => {
      const prohibitedUrls = [
        "http://127.0.0.1:8080/admin",
        "http://localhost:3000/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/secrets",
      ];

      for (const url of prohibitedUrls) {
        const workflow: Workflow = {
          id: `wf_ssrf_${Math.random().toString(36).slice(2, 6)}`,
          name: "SSRF Test",
          nodes: [
            {
              id: "http_node",
              type: "controlled_http_request",
              config: { url, allowLocalNetwork: false },
            },
          ],
          edges: [],
        };

        const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
        assert.equal(summary.status, "failed");
        assert.equal(summary.error?.code, "SSRF_PROHIBITED_HOST");
      }
    });

    it("rejects non-HTTP protocols such as file:// and gopher://", async () => {
      const workflow: Workflow = {
        id: "wf_bad_proto",
        name: "Bad Proto Test",
        nodes: [
          {
            id: "http_node",
            type: "controlled_http_request",
            config: { url: "file:///etc/passwd" },
          },
        ],
        edges: [],
      };

      const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
      assert.equal(summary.status, "failed");
      assert.equal(summary.error?.code, "FORBIDDEN_PROTOCOL");
    });
  });

  describe("Human Approval Gate Node", () => {
    it("routes to approved branch when input indicates approval", async () => {
      const workflow: Workflow = {
        id: "wf_approved",
        name: "Approval Test",
        nodes: [
          {
            id: "input_node",
            type: "static_value",
            config: { value: { approved: true, action: "publish_article" } },
          },
          {
            id: "gate_node",
            type: "human_approval_gate",
            config: {},
          },
          {
            id: "publish_step",
            type: "passthrough",
            config: {},
          },
        ],
        edges: [
          { source: "input_node", target: "gate_node" },
          { source: "gate_node", target: "publish_step", sourceHandle: "approved" },
        ],
      };

      const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
      assert.equal(summary.status, "completed");
      assert.equal(summary.nodeStates["publish_step"], "completed");
    });

    it("routes to rejected branch when input is not approved", async () => {
      const workflow: Workflow = {
        id: "wf_rejected",
        name: "Rejection Test",
        nodes: [
          {
            id: "input_node",
            type: "static_value",
            config: { value: { approved: false, action: "publish_article" } },
          },
          {
            id: "gate_node",
            type: "human_approval_gate",
            config: {},
          },
          {
            id: "publish_step",
            type: "passthrough",
            config: {},
          },
          {
            id: "audit_step",
            type: "passthrough",
            config: {},
          },
        ],
        edges: [
          { source: "input_node", target: "gate_node" },
          { source: "gate_node", target: "publish_step", sourceHandle: "approved" },
          { source: "gate_node", target: "audit_step", sourceHandle: "rejected" },
        ],
      };

      const summary = await executeWorkflow(workflow, defaultNodeRegistry.toHandlerProvider());
      assert.equal(summary.status, "completed");
      assert.equal(summary.nodeStates["publish_step"], "skipped");
      assert.equal(summary.nodeStates["audit_step"], "completed");
    });
  });
});
