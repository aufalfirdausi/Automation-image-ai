import type { NodeDefinition } from "../types.js";
import { defaultNodeRegistry } from "../registry.js";

/**
 * 1. PassThroughNode: passes input payload directly to output without modification.
 */
export const passThroughNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  unknown,
  unknown
> = {
  manifest: {
    type: "passthrough",
    name: "Pass Through",
    version: "1.0.0",
    description: "Passes input data directly to downstream nodes without alteration.",
    category: "utility",
    inputs: [{ id: "main", label: "Input" }],
    outputs: [{ id: "main", label: "Output" }],
    configFields: [],
  },
  handler: {
    async execute(params) {
      return {
        success: true,
        output: params.input,
      };
    },
  },
};

/**
 * 2. StaticValueNode: emits a configured static value as output.
 */
export const staticValueNodeDefinition: NodeDefinition<
  { value: unknown },
  unknown,
  unknown
> = {
  manifest: {
    type: "static_value",
    name: "Static Value",
    version: "1.0.0",
    description: "Emits a static configured value.",
    category: "utility",
    inputs: [],
    outputs: [{ id: "main", label: "Value Output" }],
    configFields: [
      {
        name: "value",
        label: "Value",
        type: "string",
        required: true,
        description: "The static value to emit.",
      },
    ],
  },
  handler: {
    async execute(params) {
      return {
        success: true,
        output: params.config.value,
      };
    },
  },
};

/**
 * 3. TextTransformNode: performs safe string transformations (uppercase, lowercase, trim).
 */
export const textTransformNodeDefinition: NodeDefinition<
  { operation: "uppercase" | "lowercase" | "trim" },
  unknown,
  string
> = {
  manifest: {
    type: "text_transform",
    name: "Text Transform",
    version: "1.0.0",
    description: "Transforms text input using basic string operations.",
    category: "utility",
    inputs: [{ id: "text", label: "Input Text" }],
    outputs: [{ id: "text", label: "Transformed Text" }],
    configFields: [
      {
        name: "operation",
        label: "Operation",
        type: "select",
        required: true,
        defaultValue: "uppercase",
        options: [
          { label: "Uppercase", value: "uppercase" },
          { label: "Lowercase", value: "lowercase" },
          { label: "Trim", value: "trim" },
        ],
      },
    ],
  },
  handler: {
    async execute(params) {
      const text = typeof params.input === "string" ? params.input : String(params.input ?? "");
      let result = text;

      switch (params.config.operation) {
        case "uppercase":
          result = text.toUpperCase();
          break;
        case "lowercase":
          result = text.toLowerCase();
          break;
        case "trim":
          result = text.trim();
          break;
      }

      return {
        success: true,
        output: result,
      };
    },
  },
};

/**
 * 4. ConditionBranchNode: evaluates a boolean condition and emits 'true' or 'false' branch.
 */
export const conditionBranchNodeDefinition: NodeDefinition<
  { operator: "equals" | "not_equals" | "truthy"; compareValue?: unknown },
  unknown,
  { evaluated: boolean; input: unknown }
> = {
  manifest: {
    type: "condition_branch",
    name: "Condition Branch",
    version: "1.0.0",
    description: "Evaluates input against condition and routes to 'true' or 'false' branch.",
    category: "logic",
    inputs: [{ id: "input", label: "Value to Evaluate" }],
    outputs: [
      { id: "true", label: "True Branch" },
      { id: "false", label: "False Branch" },
    ],
    configFields: [
      {
        name: "operator",
        label: "Operator",
        type: "select",
        required: true,
        defaultValue: "truthy",
        options: [
          { label: "Is Truthy", value: "truthy" },
          { label: "Equals", value: "equals" },
          { label: "Not Equals", value: "not_equals" },
        ],
      },
      {
        name: "compareValue",
        label: "Compare Value",
        type: "string",
        required: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      const input = params.input;
      let isTrue = false;

      switch (params.config.operator) {
        case "truthy":
          isTrue = Boolean(input);
          break;
        case "equals":
          isTrue = String(input) === String(params.config.compareValue);
          break;
        case "not_equals":
          isTrue = String(input) !== String(params.config.compareValue);
          break;
      }

      const branch = isTrue ? "true" : "false";

      return {
        success: true,
        output: { evaluated: isTrue, input },
        branch,
      };
    },
  },
};

/**
 * 5. WebhookTriggerNode: receives inbound webhook request payload from execution metadata.
 */
export const webhookTriggerNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  unknown,
  unknown
> = {
  manifest: {
    type: "webhook_trigger",
    name: "Webhook Trigger",
    version: "1.0.0",
    description: "Trigger node receiving inbound webhook request payload.",
    category: "trigger",
    inputs: [],
    outputs: [{ id: "payload", label: "Payload" }],
    configFields: [],
  },
  handler: {
    async execute(params) {
      const payload = params.context.metadata?.triggerPayload ?? params.input ?? null;
      return {
        success: true,
        output: payload,
      };
    },
  },
};

/**
 * 6. ScheduleTriggerNode: root node for scheduled interval/cron executions.
 */
export const scheduleTriggerNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  unknown,
  unknown
> = {
  manifest: {
    type: "schedule_trigger",
    name: "Schedule Trigger",
    version: "1.0.0",
    description: "Trigger node for cron/interval scheduled executions.",
    category: "trigger",
    inputs: [],
    outputs: [{ id: "main", label: "Trigger Output" }],
    configFields: [],
  },
  handler: {
    async execute(params) {
      return {
        success: true,
        output: { triggeredAt: params.context.startedAt },
      };
    },
  },
};

/**
 * 7. ManualTriggerNode: root node for manually triggered workflows in the visual editor.
 */
export const manualTriggerNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  unknown,
  unknown
> = {
  manifest: {
    type: "manual_trigger",
    name: "Manual Trigger",
    version: "1.0.0",
    description: "Manual trigger node initiated directly by a user or visual editor run.",
    category: "trigger",
    inputs: [],
    outputs: [{ id: "default", label: "Trigger Output" }],
    configFields: [],
  },
  handler: {
    async execute(params) {
      const payload =
        params.context.metadata?.triggerPayload ??
        params.input ?? {
          triggeredAt: params.context.startedAt,
          manual: true,
        };

      return {
        success: true,
        output: payload,
      };
    },
  },
};

/**
 * 8. ActionNode: general action node for executing tasks and passing data in the visual editor.
 */
export const actionNodeDefinition: NodeDefinition<
  Record<string, unknown>,
  unknown,
  unknown
> = {
  manifest: {
    type: "action",
    name: "Action",
    version: "1.0.0",
    description: "Action node executing a task or passing data to downstream nodes.",
    category: "utility",
    inputs: [{ id: "input", label: "Input" }],
    outputs: [{ id: "default", label: "Output" }],
    configFields: [],
  },
  handler: {
    async execute(params) {
      const output =
        params.input !== undefined && params.input !== null
          ? params.input
          : params.config ?? {};

      return {
        success: true,
        output,
      };
    },
  },
};

/**
 * 9. ConditionNode: conditional branch node for visual editor with true/false branch handles.
 */
export const conditionNodeDefinition: NodeDefinition<
  { operator?: "truthy" | "equals" | "not_equals"; compareValue?: unknown },
  unknown,
  { evaluated: boolean; input: unknown }
> = {
  manifest: {
    type: "condition",
    name: "Condition",
    version: "1.0.0",
    description: "Evaluates condition on input data and routes to 'true' or 'false' branch handle.",
    category: "logic",
    inputs: [{ id: "input", label: "Input" }],
    outputs: [
      { id: "true", label: "True Branch" },
      { id: "false", label: "False Branch" },
    ],
    configFields: [
      {
        name: "operator",
        label: "Operator",
        type: "select",
        required: false,
        defaultValue: "truthy",
        options: [
          { label: "Is Truthy", value: "truthy" },
          { label: "Equals", value: "equals" },
          { label: "Not Equals", value: "not_equals" },
        ],
      },
      {
        name: "compareValue",
        label: "Compare Value",
        type: "string",
        required: false,
      },
    ],
  },
  handler: {
    async execute(params) {
      const input = params.input;
      const operator = params.config?.operator || "truthy";
      let isTrue = false;

      switch (operator) {
        case "truthy":
          isTrue = Boolean(input);
          break;
        case "equals":
          isTrue = String(input) === String(params.config?.compareValue ?? "");
          break;
        case "not_equals":
          isTrue = String(input) !== String(params.config?.compareValue ?? "");
          break;
      }

      const branch = isTrue ? "true" : "false";

      return {
        success: true,
        output: { evaluated: isTrue, input },
        branch,
      };
    },
  },
};

/**
 * Registers all core utility nodes into a target registry.
 */
export function registerCoreNodes(registry = defaultNodeRegistry): void {
  const nodes = [
    passThroughNodeDefinition,
    staticValueNodeDefinition,
    textTransformNodeDefinition,
    conditionBranchNodeDefinition,
    webhookTriggerNodeDefinition,
    scheduleTriggerNodeDefinition,
    manualTriggerNodeDefinition,
    actionNodeDefinition,
    conditionNodeDefinition,
  ];

  for (const node of nodes) {
    if (!registry.has(node.manifest.type)) {
      registry.register(node as any);
    }
  }
}
