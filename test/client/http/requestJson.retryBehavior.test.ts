import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import { BsuirApiError } from "../../../src/client/errors";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

describe("requestJson — retry behavior", () => {
  it("retries retriable status codes", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "unavailable" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 1 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("emits retry hook for retriable responses", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "temporary" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const onRetry = vi.fn();
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 1,
      hooks: { onRetry }
    });

    await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "http_status",
        status: 503
      })
    );
  });

  it("does not retry non-retriable status codes", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 400, body: { message: "bad request" } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 2 });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("respects Retry-After header for retriable responses", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        status: 429,
        headers: { "Retry-After": "0" },
        body: { message: "too many requests" }
      }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 1 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("supports Retry-After in HTTP-date format", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        status: 429,
        headers: { "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" },
        body: { message: "too many requests" }
      }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 1 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("caps retry delay by retryMaxDelayMs", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = mockFetchSequence([
        createJsonResponse({ status: 503, body: { message: "temporary error" } }),
        createJsonResponse({ body: { ok: true } })
      ]);
      const config = createRequestJsonConfig(fetchImpl, {
        retries: 1,
        retryDelayMs: 2000,
        retryMaxDelayMs: 50,
        retryJitter: false
      });

      const requestPromise = requestJson<{ ok: boolean }>(config, "/faculties");
      await Promise.resolve();
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(49);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      const response = await requestPromise;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(response.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry non-GET methods", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "temporary error" } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, { retries: 3 });

    await expect(
      requestJson(config, "/faculties", {
        method: "POST",
        body: { value: 1 }
      })
    ).rejects.toBeInstanceOf(BsuirApiError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("interrupts the Retry-After wait when the caller aborts mid-wait", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({
        status: 503,
        headers: { "Retry-After": "1" },
        body: { message: "slow down" }
      });
    }) as unknown as typeof globalThis.fetch;
    const onRetry = vi.fn(() => {
      setTimeout(() => controller.abort(), 10);
    });
    const config = createRequestJsonConfig(fetchImpl, { retries: 1, hooks: { onRetry } });

    const startedAt = Date.now();
    await expect(
      requestJson(config, "/faculties", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });

    // The abort must cut the wait short; reaching here via the full Retry-After
    // delay would mean the retry wait ignored the caller's signal.
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "http_status", status: 503, delayMs: 1000 })
    );
  }, 10_000);

  it("treats oversized Retry-After as non-retriable and surfaces hook context", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        status: 503,
        headers: { "Retry-After": "120" },
        body: { message: "slow down" }
      }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const onRetry = vi.fn();
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 1,
      hooks: { onRetry }
    });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "retry_after_too_large",
        status: 503
      })
    );
  });

  it("retries network errors and eventually succeeds", async () => {
    const fetchImpl = mockFetchSequence([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      retries: 2,
      retryDelayMs: 1,
      retryMaxDelayMs: 10
    });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });
});
