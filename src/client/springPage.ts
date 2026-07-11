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

export interface SpringPageMeta {
  totalPages: number | undefined;
  last: boolean | undefined;
  pageNumber: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Reads Spring Data pagination fields when `payload` is a page envelope
 * with an array `content`. Returns `null` for plain arrays / non-pages.
 */
export function readSpringPageMeta(payload: unknown): SpringPageMeta | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.content)) {
    return null;
  }

  const pageable =
    typeof record.pageable === "object" && record.pageable !== null
      ? (record.pageable as Record<string, unknown>)
      : undefined;

  const pageNumberRaw = pageable?.pageNumber ?? record.number;
  const pageSizeRaw = pageable?.pageSize ?? record.size;

  return {
    totalPages: typeof record.totalPages === "number" ? record.totalPages : undefined,
    last: typeof record.last === "boolean" ? record.last : undefined,
    pageNumber: typeof pageNumberRaw === "number" ? pageNumberRaw : 0,
    pageSize: typeof pageSizeRaw === "number" && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE
  };
}
