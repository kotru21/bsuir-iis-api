import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/client/http";
import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "../../src/client/errors";
import type { InternalClientConfig } from "../../src/client/types";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

const BASE_CONFIG: Omit<InternalClientConfig, "fetchImpl"> = {
  baseUrl: "https://iis.bsuir.by/api/v1",
  timeoutMs: 1_000,
  retries: 0,
  retryDelayMs: 1,
  retryMaxDelayMs: 500,
  retryJitter: false,
  userAgent: "test",
  defaultRaw: false
};

describe("requestJson", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { hello: "world" } })]);
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl };

    const response = await requestJson<{ hello: string }>(config, "/faculties");

    expect(response.hello).toBe("world");
  });

  it("throws BsuirApiError for non-2xx response", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 500, body: { message: "Server error" } })
    ]);
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 0 };

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("retries retriable status codes", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "unavailable" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 1 };

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("does not retry non-retriable status codes", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 400, body: { message: "bad request" } })
    ]);
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 2 };

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
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 1, retryDelayMs: 200 };

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
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 1 };

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
      const config: InternalClientConfig = {
        ...BASE_CONFIG,
        fetchImpl,
        retries: 1,
        retryDelayMs: 2_000,
        retryMaxDelayMs: 50,
        retryJitter: false
      };

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

  it("throws BsuirNetworkError on exhausted retries", async () => {
    const fetchImpl = mockFetchSequence([new Error("ECONNRESET")]);
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, retries: 0 };

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirNetworkError);
  });

  it("retries network errors and eventually succeeds", async () => {
    const fetchImpl = mockFetchSequence([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config: InternalClientConfig = {
      ...BASE_CONFIG,
      fetchImpl,
      retries: 2,
      retryDelayMs: 1,
      retryMaxDelayMs: 10
    };

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("throws timeout error when request takes too long", async () => {
    const fetchImpl = (async (_input, init) => {
      const signal = init?.signal;
      await new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted", "AbortError"));
          return;
        }
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true }
        );
      });
      return createJsonResponse({ body: {} });
    }) as typeof globalThis.fetch;

    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, timeoutMs: 10 };

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirTimeoutError);
  });

  it("propagates external AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({ body: { ok: true } });
    }) as typeof globalThis.fetch;
    const config: InternalClientConfig = { ...BASE_CONFIG, fetchImpl, timeoutMs: 5_000 };

    await expect(requestJson(config, "/faculties", { signal: controller.signal })).rejects.toMatchObject(
      { name: "AbortError" }
    );
  });
});
