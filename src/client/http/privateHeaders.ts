// Explicit denylist of header names that carry per-identity credentials. Any of these,
// when present on a request, disables shared response caching and in-flight dedup so
// that one identity's response cannot be returned to another caller.
const PRIVATE_HEADER_DENYLIST = new Set<string>([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-session-id",
  "x-session-token"
]);

function isPrivateHeader(name: string): boolean {
  return PRIVATE_HEADER_DENYLIST.has(name.toLowerCase());
}

export function hasPrivateHeaders(headers: Headers): boolean {
  for (const [key] of headers.entries()) {
    if (isPrivateHeader(key)) {
      return true;
    }
  }
  return false;
}
