import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizePayload } from "../src/runs/sanitize.js";

describe("Phase 5.2: Payload Sanitization & Redaction Unit Tests", () => {
  it("redacts sensitive keys in flat and nested objects", () => {
    const sensitiveData = {
      username: "john_doe",
      password: "super_secret_password_123",
      apiKey: "sk-1234567890abcdef",
      nested: {
        authorization: "Bearer eyJhbGciOi...",
        secretToken: "xyz-token",
        normalKey: "regular_value",
      },
    };

    const sanitized = sanitizePayload(sensitiveData) as Record<string, any>;
    assert.strictEqual(sanitized.username, "john_doe");
    assert.strictEqual(sanitized.password, "[REDACTED]");
    assert.strictEqual(sanitized.apiKey, "[REDACTED]");
    assert.strictEqual(sanitized.nested.authorization, "[REDACTED]");
    assert.strictEqual(sanitized.nested.secretToken, "[REDACTED]");
    assert.strictEqual(sanitized.nested.normalKey, "regular_value");
  });

  it("truncates excessively large strings to prevent database bloat", () => {
    const hugeString = "A".repeat(40000);
    const sanitized = sanitizePayload(hugeString) as string;

    assert.ok(sanitized.length < 40000);
    assert.ok(sanitized.endsWith("... [TRUNCATED]"));
  });

  it("truncates excessively long arrays", () => {
    const largeArray = Array.from({ length: 150 }, (_, i) => i);
    const sanitized = sanitizePayload(largeArray) as any[];

    assert.strictEqual(sanitized.length, 101); // 100 items + 1 truncation marker
    assert.deepStrictEqual(sanitized[100], { "[TRUNCATED]": "50 more items" });
  });

  it("safely handles circular references without infinite recursion", () => {
    const circularObj: any = { name: "loop" };
    circularObj.self = circularObj;

    const sanitized = sanitizePayload(circularObj) as any;
    assert.strictEqual(sanitized.name, "loop");
    assert.strictEqual(sanitized.self, "[CIRCULAR_REFERENCE]");
  });

  it("preserves primitives, dates, and null values intact", () => {
    assert.strictEqual(sanitizePayload(null), null);
    assert.strictEqual(sanitizePayload(undefined), undefined);
    assert.strictEqual(sanitizePayload(42), 42);
    assert.strictEqual(sanitizePayload(true), true);
    assert.strictEqual(sanitizePayload("short text"), "short text");

    const date = new Date("2026-09-30T12:00:00.000Z");
    assert.strictEqual(sanitizePayload(date), "2026-09-30T12:00:00.000Z");
  });
});
