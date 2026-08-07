import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRetryDecision, getRetryDelayMs, sleep } from "../../../src/client/http/retry";
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

  it("parses HTTP-date correctly when in future (honored beyond retryMaxDelayMs)", () => {
    const future = new Date(Date.now() + 20_000).toUTCString();
    const decision = getRetryDecision(baseConfig, 0, future);
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      // Server hints are honored in full up to the 60s ceiling; retryMaxDelayMs
      // (10_000 here) caps only the client's own exponential backoff.
      expect(decision.delayMs).toBeGreaterThan(baseConfig.retryMaxDelayMs);
      expect(decision.delayMs).toBeLessThanOrEqual(20_000);
    }
  });

  it("honors numeric Retry-After beyond retryMaxDelayMs", () => {
    const decision = getRetryDecision(baseConfig, 0, "30");
    expect(decision.retryable).toBe(true);
    if (decision.retryable) {
      expect(decision.delayMs).toBe(30_000);
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

describe("sleep — abort-aware waiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after the delay when no signals are given", async () => {
    let resolved = false;
    const observed = (async () => {
      await sleep(500);
      resolved = true;
    })();

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    await observed;
  });

  it("resolves immediately when a signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    let resolved = false;
    const observed = (async () => {
      await sleep(60_000, [controller.signal]);
      resolved = true;
    })();

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    await observed;
  });

  it("resolves early when a signal aborts mid-wait", async () => {
    const controller = new AbortController();

    let resolved = false;
    const observed = (async () => {
      await sleep(60_000, [undefined, controller.signal]);
      resolved = true;
    })();

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);

    controller.abort();
    // No timer advancement: if abort did not wake the sleep, this await would hang.
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    await observed;
  });
});
