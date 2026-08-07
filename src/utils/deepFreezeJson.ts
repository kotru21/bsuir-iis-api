/**
 * Deep-freezes a JSON-compatible value in place (objects/arrays only).
 * Skips already-frozen roots; recurses into own enumerable properties.
 */
export function deepFreezeJson<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezeJson(item);
    }
  } else {
    for (const value_ of Object.values(value as Record<string, unknown>)) {
      deepFreezeJson(value_);
    }
  }
  return value;
}
