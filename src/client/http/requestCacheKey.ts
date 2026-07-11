import type { RequestMethod } from "../types";

const CACHE_KEY_HEADER_ALLOWLIST = new Set<string>(["accept", "accept-language"]);

function normalizeHeadersForRequestKey(headers: Headers): string {
  return [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .filter(([key]) => CACHE_KEY_HEADER_ALLOWLIST.has(key))
    .toSorted((a, b) => {
      if (a[0] !== b[0]) {
        return a[0] < b[0] ? -1 : 1;
      }
      if (a[1] !== b[1]) {
        return a[1] < b[1] ? -1 : 1;
      }
      return 0;
    })
    .map(([key, value]) => `${key}:${value}`)
    .join("\n");
}

export function buildRequestKey(method: RequestMethod, endpoint: string, headers: Headers): string {
  return `${method}\n${endpoint}\n${normalizeHeadersForRequestKey(headers)}`;
}
