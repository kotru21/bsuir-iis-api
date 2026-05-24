import { describe, expect, it } from "vitest";
import { getRetryDecision, getRetryDelayMs } from "../../../src/client/http/retry";
import type { InternalClientConfig } from "../../../src/client/types";

const baseConfig: InternalClientConfig = {
  baseUrl: "https://iis.bsuir.by/api/v1",
  fetchImpl: fetch,
  signal: undefined,
  timeoutMs: 10_000,
  retries: 2,
  retryDelayMs: 300,
  retryMaxDelayMs: 10_000,
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

describe("retry parsing — Retry-After header", () => {
  it("parses numeric seconds correctly", () => {
    const decision = getRetryDecision(baseConfig, 0, "5");
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      expect(decision.delayMs).toBe(5000);
    }
  });

  it("parses HTTP-date correctly when in future (capped by retryMaxDelayMs)", () => {
    const future = new Date(Date.now() + 20_000).toUTCString();
    const decision = getRetryDecision(baseConfig, 0, future);
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      // Should be capped by retryMaxDelayMs (10_000)
      expect(decision.delayMs).toBe(baseConfig.retryMaxDelayMs);
    }
  });

  it("falls back to backoff when Retry-After is a past date", () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    const decision = getRetryDecision(baseConfig, 0, past);
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      // backoff for attempt 0 equals retryDelayMs when jitter disabled
      expect(decision.delayMs).toBe(baseConfig.retryDelayMs);
    }
  });

  it("getRetryDelayMs returns backoff when retry rejected due to too large Retry-After", () => {
    // Provide a very large numeric Retry-After to exceed MAX_ACCEPTED_RETRY_AFTER_MS
    const veryLarge = String(120); // 120s = 120000ms > 60000ms threshold
    const delay = getRetryDelayMs(baseConfig, 0, veryLarge);
    // When rejected, getRetryDelayMs falls back to backoff
    expect(delay).toBe(baseConfig.retryDelayMs);
  });

  it("treats invalid Retry-After header as absent and uses backoff", () => {
    const decision = getRetryDecision(baseConfig, 0, "not-a-date-or-number");
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      expect(decision.delayMs).toBe(baseConfig.retryDelayMs);
    }
  });
});
