import type { QueryParams } from "../types";
import { BsuirValidationError } from "../errors";

// Reject control chars (incl. CR/LF/NUL), whitespace, DEL, and URL-structural characters
// (`?`, `#`, `&`, `=`). Other printable characters are allowed and will be percent-encoded
// by URLSearchParams as needed.
// eslint-disable-next-line no-control-regex
const UNSAFE_QUERY_KEY = /[\u0000-\u0020\u007F&=?#]/;
const SCHEME_PREFIX = /^[A-Za-z][A-Za-z\d+.-]*:/;

function assertSafeQueryKey(key: string): void {
  if (key.length === 0) {
    throw new BsuirValidationError("Query parameter key must not be empty", "queryKey", key);
  }
  if (UNSAFE_QUERY_KEY.test(key)) {
    throw new BsuirValidationError(
      `Invalid query parameter key '${key}': must not contain control characters, whitespace, or '? # & ='`,
      "queryKey",
      key
    );
  }
}

function assertSafePath(path: string): void {
  if (path.trim().length === 0) {
    throw new BsuirValidationError("Path must not be empty", "path", path);
  }
  if (path.includes("\\")) {
    throw new BsuirValidationError(
      "Path must use forward slashes and must not contain backslashes",
      "path",
      path
    );
  }
  if (path.startsWith("//")) {
    throw new BsuirValidationError("Path must not start with '//'", "path", path);
  }
  if (SCHEME_PREFIX.test(path)) {
    throw new BsuirValidationError("Path must not include a URL scheme", "path", path);
  }

  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const segments = normalizedPath.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new BsuirValidationError("Path contains malformed escape sequence", "path", path);
    }
    if (decodedSegment === "." || decodedSegment === "..") {
      throw new BsuirValidationError(
        "Path must not contain relative traversal segments",
        "path",
        path
      );
    }
  }
}

/**
 * Builds absolute endpoint URL from base URL, path and query params.
 *
 * Query parameters are sorted by key to produce deterministic URLs - important
 * for cache key stability and for reproducible request fingerprints.
 */
export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  assertSafePath(path);
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (query) {
    const sortedEntries = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [key, value] of sortedEntries) {
      assertSafeQueryKey(key);
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
