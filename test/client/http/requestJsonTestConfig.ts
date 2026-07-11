import type { InternalClientConfig } from "../../../src/client/types";

export const REQUEST_JSON_BASE_CONFIG: Omit<InternalClientConfig, "fetchImpl"> = {
  baseUrl: "https://iis.bsuir.by/api/v1",
  signal: undefined,
  timeoutMs: 1000,
  retries: 0,
  retryDelayMs: 1,
  retryMaxDelayMs: 500,
  retryJitter: false,
  userAgent: "test",
  cacheTtlMs: undefined,
  cacheMaxEntries: 200,
  dedupeInFlight: true,
  maxResponseBytes: 5_000_000,
  validateResponses: false,
  hooks: {},
  responseCache: new Map(),
  inFlightRequests: new Map()
};

/** Fresh cache maps per call to avoid cross-test contamination. */
export function createRequestJsonConfig(
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<InternalClientConfig> = {}
): InternalClientConfig {
  return {
    ...REQUEST_JSON_BASE_CONFIG,
    responseCache: new Map(),
    inFlightRequests: new Map(),
    fetchImpl,
    ...overrides
  };
}
