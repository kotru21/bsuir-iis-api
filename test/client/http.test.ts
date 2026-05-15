import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/client/http";
import { BsuirApiError, BsuirNetworkError, BsuirTimeoutError } from "../../src/client/errors";
import type { InternalClientConfig } from "../../src/client/types";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";

const BASE_CONFIG: Omit<InternalClientConfig, "fetchImpl"> = {
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
  inFlightRequests: new Map(),
  defaultRaw: false
};

function createConfig(
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<InternalClientConfig> = {}
): InternalClientConfig {
  return {
    ...BASE_CONFIG,
    // Always create fresh cache maps for each test to avoid cross-test contamination
    responseCache: new Map(),
    inFlightRequests: new Map(),
    fetchImpl,
    ...overrides
  };
}

describe("requestJson", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { hello: "world" } })]);
    const config = createConfig(fetchImpl);

    const response = await requestJson<{ hello: string }>(config, "/faculties");

    expect(response.hello).toBe("world");
  });

  it("emits request/response hooks for successful request", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const config = createConfig(fetchImpl, {
      hooks: { onRequest, onResponse }
    });

    await requestJson<{ ok: boolean }>(config, "/faculties", {
      query: { lang: "ru" }
    });

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/faculties",
        attempt: 1,
        fromCache: false,
        status: 200
      })
    );
  });

  it("parses JSON success body even when Content-Type omits application/json", async () => {
    const fetchImpl = mockFetchSequence([
      Response.json(
        { ok: true },
        {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        }
      )
    ]);
    const config = createConfig(fetchImpl, { retries: 0 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("throws BsuirApiError when Content-Type is JSON but success body is empty", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ]);
    const config = createConfig(fetchImpl, { retries: 0 });

    await expect(requestJson(config, "/faculties")).rejects.toBeInstanceOf(BsuirApiError);
  });

  it("returns empty string when success body is empty and Content-Type is not JSON", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    ]);
    const config = createConfig(fetchImpl, { retries: 0 });

    const body = await requestJson<string>(config, "/faculties");
    expect(body).toBe("");
  });

  it("throws BsuirApiError when JSON Content-Type body is not valid JSON", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ]);
    const config = createConfig(fetchImpl, { retries: 0 });

    const error = await requestJson(config, "/faculties").catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(BsuirApiError);
    expect(error).toMatchObject({
      message: "Invalid JSON response payload",
      status: 200,
      body: null
    });
  });

  it("throws BsuirApiError when response body exceeds configured maxResponseBytes", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("payload-that-is-way-too-large", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": "29"
        }
      })
    ]);
    const config = createConfig(fetchImpl, { retries: 0, maxResponseBytes: 10 });

    const error = await requestJson(config, "/faculties").catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(BsuirApiError);
    expect(error).toMatchObject({
      message: "Response body exceeds maxResponseBytes limit (10 bytes)"
    });
  });

  it("throws BsuirApiError for non-2xx response", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 500, body: { message: "Server error" } })
    ]);
    const config = createConfig(fetchImpl, { retries: 0 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirApiError);
    await expect(request).rejects.toMatchObject({
      status: 500,
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      body: { message: "Server error" }
    });
  });

  it("retries retriable status codes", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "unavailable" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createConfig(fetchImpl, { retries: 1 });

    const response = await requestJson<{ ok: boolean }>(config, "/faculties");
    expect(response.ok).toBe(true);
  });

  it("emits retry hook for retriable responses", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "temporary" } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const onRetry = vi.fn();
    const config = createConfig(fetchImpl, {
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
    const config = createConfig(fetchImpl, { retries: 2 });

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
    const config = createConfig(fetchImpl, { retries: 1 });

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
    const config = createConfig(fetchImpl, { retries: 1 });

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
      const config = createConfig(fetchImpl, {
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

  it("throws BsuirNetworkError on exhausted retries", async () => {
    const transportError = new Error("ECONNRESET");
    const fetchImpl = mockFetchSequence([transportError]);
    const config = createConfig(fetchImpl, { retries: 0 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirNetworkError);
    await expect(request).rejects.toMatchObject({
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      cause: transportError
    });
  });

  it("does not retry non-GET methods", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ status: 503, body: { message: "temporary error" } })
    ]);
    const config = createConfig(fetchImpl, { retries: 3 });

    await expect(
      requestJson(config, "/faculties", {
        method: "POST",
        body: { value: 1 }
      })
    ).rejects.toBeInstanceOf(BsuirApiError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("propagates global client signal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({ body: { ok: true } });
    }) as typeof globalThis.fetch;
    const config = createConfig(fetchImpl, { signal: controller.signal });

    await expect(requestJson(config, "/faculties")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns cached GET response within ttl window", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const config = createConfig(fetchImpl, {
      cacheTtlMs: 60_000
    });

    const first = await requestJson<{ ok: boolean }>(config, "/faculties");
    const second = await requestJson<{ ok: boolean }>(config, "/faculties");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent in-flight GET requests", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof globalThis.fetch;
    const config = createConfig(fetchImpl);

    const firstPromise = requestJson<{ ok: boolean }>(config, "/faculties");
    const secondPromise = requestJson<{ ok: boolean }>(config, "/faculties");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    if (!resolveFetch) {
      throw new Error("fetch resolver was not initialized");
    }
    resolveFetch(createJsonResponse({ body: { ok: true } }));

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("does not deduplicate GET requests with caller AbortSignal", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { ok: true } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createConfig(fetchImpl);
    const signalA = new AbortController().signal;
    const signalB = new AbortController().signal;

    await Promise.all([
      requestJson<{ ok: boolean }>(config, "/faculties", { signal: signalA }),
      requestJson<{ ok: boolean }>(config, "/faculties", { signal: signalB })
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries network errors and eventually succeeds", async () => {
    const fetchImpl = mockFetchSequence([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createConfig(fetchImpl, {
      retries: 2,
      retryDelayMs: 1,
      retryMaxDelayMs: 10
    });

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

    const config = createConfig(fetchImpl, { timeoutMs: 10 });

    const request = requestJson(config, "/faculties");
    await expect(request).rejects.toBeInstanceOf(BsuirTimeoutError);
    await expect(request).rejects.toMatchObject({
      endpoint: "https://iis.bsuir.by/api/v1/faculties",
      timeoutMs: 10
    });
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
    const config = createConfig(fetchImpl, { timeoutMs: 5000 });

    await expect(
      requestJson(config, "/faculties", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
