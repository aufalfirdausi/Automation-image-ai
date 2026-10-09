export type GuardrailViolationType = "SCHEMA_MISMATCH" | "SAFETY_BLOCKED" | "LENGTH_LIMIT";

export interface GuardrailViolation {
  field?: string;
  type: GuardrailViolationType;
  message: string;
}

export interface GuardrailValidationResult {
  isValid: boolean;
  violations: GuardrailViolation[];
}

export interface GuardrailRuleConfig {
  requiredFields?: string[];
  maxStringLength?: number;
  blockedPatterns?: string[];
  allowedTypes?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
}
