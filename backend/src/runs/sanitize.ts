const SENSITIVE_KEY_REGEX =
  /(password|token|secret|api[_-]?key|authorization|credential|private[_-]?key|access[_-]?token)/i;

const MAX_STRING_LENGTH = 32768; // 32KB per string value
const MAX_ARRAY_LENGTH = 100;
const MAX_DEPTH = 10;

/**
 * Sanitizes input and output payloads by redacting secret/credential fields
 * and truncating excessively large data to prevent database bloat.
 */
export function sanitizePayload(
  payload: unknown,
  depth = 0,
  visited = new WeakSet<object>()
): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === "string") {
    if (payload.length > MAX_STRING_LENGTH) {
      return payload.substring(0, MAX_STRING_LENGTH) + "... [TRUNCATED]";
    }
    return payload;
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return payload;
  }

  if (typeof payload === "bigint" || typeof payload === "symbol") {
    return String(payload);
  }

  if (typeof payload === "function") {
    return "[FUNCTION]";
  }

  if (depth >= MAX_DEPTH) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (typeof payload === "object") {
    if (visited.has(payload)) {
      return "[CIRCULAR_REFERENCE]";
    }
    visited.add(payload);

    if (Array.isArray(payload)) {
      const items = payload
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => sanitizePayload(item, depth + 1, visited));

      if (payload.length > MAX_ARRAY_LENGTH) {
        items.push({ "[TRUNCATED]": `${payload.length - MAX_ARRAY_LENGTH} more items` });
      }
      return items;
    }

    if (payload instanceof Date) {
      return payload.toISOString();
    }

    if (payload instanceof Error) {
      return {
        name: payload.name,
        message: payload.message,
      };
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizePayload(val, depth + 1, visited);
      }
    }
    return sanitizedObj;
  }

  return String(payload);
}
