/**
 * Builds the cache / in-flight dedup key of a request.
 *
 * Requests are always `GET` with fixed headers (`Accept: application/json`, optional
 * client-wide `User-Agent`), so the absolute endpoint URL — with query parameters
 * already sorted by `buildUrl` — identifies the response.
 */
export function buildRequestKey(endpoint: string): string {
  return `GET ${endpoint}`;
}
