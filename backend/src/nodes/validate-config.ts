import type { NodeManifest } from "./types.js";

export interface ConfigValidationIssue {
  field: string;
  message: string;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationIssue[];
}

/**
 * Validates a node's configuration object against its registered manifest schema.
 *
 * Rules:
 * - Checks for required fields: cannot be undefined, null, or empty string.
 * - Validates field primitive types: string, number, boolean, select, json.
 * - Validates select options: value must be one of the declared options.
 * - Handles json fields: must be valid objects or parseable JSON.
 */
export function validateNodeConfig(
  manifest: NodeManifest,
  config: unknown
): ConfigValidationResult {
  const errors: ConfigValidationIssue[] = [];

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      isValid: false,
      errors: [
        {
          field: "_root",
          message: "Node configuration must be an object",
        },
      ],
    };
  }

  const configObj = config as Record<string, unknown>;

  for (const field of manifest.configFields) {
    const value = configObj[field.name];

    // 1. Required field check
    if (field.required) {
      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        errors.push({
          field: field.name,
          message: `Field '${field.label || field.name}' is required`,
        });
        continue;
      }
    }

    // Skip type validation if optional and absent
    if (value === undefined || value === null) {
      continue;
    }

    // 2. Type validation
    switch (field.type) {
      case "string":
        if (typeof value !== "string") {
          errors.push({
            field: field.name,
            message: `Field '${field.label || field.name}' must be a string`,
          });
        }
        break;

      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) {
          errors.push({
            field: field.name,
            message: `Field '${field.label || field.name}' must be a valid number`,
          });
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push({
            field: field.name,
            message: `Field '${field.label || field.name}' must be a boolean`,
          });
        }
        break;

      case "select":
        if (field.options && field.options.length > 0) {
          const validValues = field.options.map((opt) => opt.value);
          if (!validValues.includes(value as string | number)) {
            errors.push({
              field: field.name,
              message: `Field '${field.label || field.name}' has invalid option '${String(value)}'`,
            });
          }
        }
        break;

      case "json":
        if (typeof value !== "object") {
          errors.push({
            field: field.name,
            message: `Field '${field.label || field.name}' must be a valid JSON object`,
          });
        }
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
