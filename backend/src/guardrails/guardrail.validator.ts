import type {
  GuardrailRuleConfig,
  GuardrailValidationResult,
  GuardrailViolation,
} from "./types.js";

// Standard safety blocklist against malicious prompt injections and arbitrary code patterns
const DEFAULT_BLOCKED_PATTERNS = [
  /eval\s*\(/i,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /\b(exec|spawn|fork)\s*\(/i,
  /\b(chmod|chown|rm\s+-rf)\b/i,
];

export class GuardrailValidator {
  /**
   * Validates an AI output payload against configured guardrails and security rules.
   */
  static validate(
    payload: unknown,
    rules?: GuardrailRuleConfig
  ): GuardrailValidationResult {
    const violations: GuardrailViolation[] = [];

    // 1. Blocklist Inspection across primitives and stringified structures
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
    for (const pattern of DEFAULT_BLOCKED_PATTERNS) {
      if (pattern.test(serialized)) {
        violations.push({
          type: "SAFETY_BLOCKED",
          message: `Payload matched unsafe code execution pattern: ${pattern.toString()}`,
        });
      }
    }

    if (rules?.blockedPatterns) {
      for (const customStr of rules.blockedPatterns) {
        try {
          const customRegex = new RegExp(customStr, "i");
          if (customRegex.test(serialized)) {
            violations.push({
              type: "SAFETY_BLOCKED",
              message: `Payload matched configured blocked pattern '${customStr}'`,
            });
          }
        } catch {
          if (serialized.toLowerCase().includes(customStr.toLowerCase())) {
            violations.push({
              type: "SAFETY_BLOCKED",
              message: `Payload contained blocked term '${customStr}'`,
            });
          }
        }
      }
    }

    // 2. Length Limit Inspection
    if (rules?.maxStringLength && typeof payload === "string") {
      if (payload.length > rules.maxStringLength) {
        violations.push({
          type: "LENGTH_LIMIT",
          message: `String length (${payload.length}) exceeds maximum limit of ${rules.maxStringLength}`,
        });
      }
    }

    // 3. Schema Structure & Field Type Inspection (if payload is object)
    if (rules && typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const obj = payload as Record<string, unknown>;

      // Check required fields
      if (rules.requiredFields) {
        for (const reqField of rules.requiredFields) {
          if (!(reqField in obj) || obj[reqField] === undefined || obj[reqField] === null) {
            violations.push({
              field: reqField,
              type: "SCHEMA_MISMATCH",
              message: `Missing required field '${reqField}' in structured output`,
            });
          }
        }
      }

      // Check allowed types
      if (rules.allowedTypes) {
        for (const [field, expectedType] of Object.entries(rules.allowedTypes)) {
          if (field in obj && obj[field] !== undefined && obj[field] !== null) {
            const actualVal = obj[field];
            const actualType = Array.isArray(actualVal)
              ? "array"
              : typeof actualVal;

            if (actualType !== expectedType) {
              violations.push({
                field,
                type: "SCHEMA_MISMATCH",
                message: `Field '${field}' expected type '${expectedType}', got '${actualType}'`,
              });
            }
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }
}
