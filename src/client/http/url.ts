import type { QueryParams } from "../types";
import { BsuirValidationError } from "../errors";

const SAFE_QUERY_KEY = /^[A-Za-z0-9_-]+$/;

function assertSafeQueryKey(key: string): void {
  if (key.trim().length === 0) {
    throw new BsuirValidationError("Query parameter key must not be empty or whitespace");
  }
  if (!SAFE_QUERY_KEY.test(key)) {
    throw new BsuirValidationError(
      `Invalid query parameter key '${key}': use only letters, digits, underscores, and hyphens`
    );
  }
}

/**
 * Builds absolute endpoint URL from base URL, path and query params.
 */
export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      assertSafeQueryKey(key);
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
