import type { QueryParams } from "../types";
import { BsuirValidationError } from "../errors";

const SAFE_QUERY_KEY = /^[A-Za-z0-9_-]+$/;
const SCHEME_PREFIX = /^[A-Za-z][A-Za-z\d+.-]*:/;

function assertSafeQueryKey(key: string): void {
  if (key.trim().length === 0) {
    throw new BsuirValidationError(
      "Query parameter key must not be empty or whitespace",
      "queryKey",
      key
    );
  }
  if (!SAFE_QUERY_KEY.test(key)) {
    throw new BsuirValidationError(
      `Invalid query parameter key '${key}': use only letters, digits, underscores, and hyphens`,
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
      throw new BsuirValidationError("Path must not contain relative traversal segments", "path", path);
    }
  }
}

/**
 * Builds absolute endpoint URL from base URL, path and query params.
 */
export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  assertSafePath(path);
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
