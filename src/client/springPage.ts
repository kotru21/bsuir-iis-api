/**
 * IIS list endpoints may return a plain JSON array (legacy) or a Spring Data
 * page envelope `{ content: T[], pageable?, totalElements?, ... }`.
 * Returns the item array when present; otherwise returns the payload unchanged
 * so callers/validators can still reject unexpected shapes.
 */
export function unwrapSpringPageContent(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === "object" && payload !== null) {
    const content = (payload as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      return content;
    }
  }

  return payload;
}
