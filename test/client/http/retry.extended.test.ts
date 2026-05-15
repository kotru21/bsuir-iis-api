import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRetryDelayMs } from "../../../src/client/http/retry";
import type { InternalClientConfig } from "../../../src/client/types";

function makeConfig(overrides: Partial<InternalClientConfig> = {}): InternalClientConfig {
  return {
    baseUrl: "https://iis.bsuir.by/api/v1",
    fetchImpl: fetch,
    signal: undefined,
    timeoutMs: 10_000,
    retries: 1,
    retryDelayMs: 300,
    retryMaxDelayMs: 3_000,
    retryJitter: true,
    userAgent: undefined,
    cacheTtlMs: undefined,
    cacheMaxEntries: 200,
    dedupeInFlight: true,
    maxResponseBytes: 5_000_000,
    validateResponses: false,
    hooks: {},
    responseCache: new Map(),
    inFlightRequests: new Map(),
    defaultRaw: false,
    ...overrides,
  };
}

describe("getRetryDelayMs", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns exact baseDelay when retryJitter is false (line 57)", () => {
    const config = makeConfig({ retryJitter: false, retryDelayMs: 300, retryMaxDelayMs: 3_000 });
    // attempt=0: baseDelay = min(300 * 2^0, 3000) = 300
    const delay = getRetryDelayMs(config, 0);
    expect(delay).toBe(300);
  });

  it("applies jitter factor in [0.75, 1.25] range when retryJitter is true (line 58)", () => {
    const config = makeConfig({ retryJitter: true, retryDelayMs: 300, retryMaxDelayMs: 3_000 });
    for (let i = 0; i < 20; i++) {
      const delay = getRetryDelayMs(config, 0);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(300 * 0.75));
      expect(delay).toBeLessThanOrEqual(Math.floor(300 * 1.25) + 1);
    }
  });

  it("uses Retry-After numeric seconds when within retryMaxDelayMs", () => {
    // retryMaxDelayMs raised above 5s so the value is NOT capped
    const config = makeConfig({ retryJitter: false, retryMaxDelayMs: 10_000 });
    const delay = getRetryDelayMs(config, 0, "5");
    expect(delay).toBe(5_000);
  });

  it("caps Retry-After at retryMaxDelayMs when header value exceeds it (line 48)", () => {
    // retryMaxDelayMs = 3000, Retry-After = 5s (5000ms) → capped at 3000
    const config = makeConfig({ retryJitter: false, retryMaxDelayMs: 3_000 });
    const delay = getRetryDelayMs(config, 0, "5");
    expect(delay).toBe(3_000);
  });

  it("ignores Retry-After HTTP date in the past (line 31)", () => {
    vi.setSystemTime(new Date("2025-05-12T10:00:00Z"));
    const config = makeConfig({ retryJitter: false, retryDelayMs: 300, retryMaxDelayMs: 3_000 });
    // Date in the past → delayMs <= 0 → parseRetryAfterMs returns null → falls back to backoff
    const delay = getRetryDelayMs(config, 0, "Mon, 12 May 2025 09:00:00 GMT");
    expect(delay).toBe(300);
  });

  it("caps baseDelay at retryMaxDelayMs (exponential overflow)", () => {
    const config = makeConfig({ retryJitter: false, retryDelayMs: 300, retryMaxDelayMs: 1_000 });
    // attempt=10: 300 * 2^10 = 307200, capped at 1000
    const delay = getRetryDelayMs(config, 10);
    expect(delay).toBe(1_000);
  });

  it("ignores empty Retry-After string", () => {
    const config = makeConfig({ retryJitter: false, retryDelayMs: 300 });
    const delay = getRetryDelayMs(config, 0, "");
    expect(delay).toBe(300);
  });
});
