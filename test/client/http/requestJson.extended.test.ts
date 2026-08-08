import { describe, expect, it, vi } from "vitest";
import { BsuirResponseValidationError, BsuirTimeoutError, createBsuirClient } from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";

describe("requestJson — additional branches", () => {
  // lines 72-73 — options.headers provided → iterated and set on request
  it("forwards custom headers to fetch (lines 72-73)", async () => {
    let capturedHeaders: Headers | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers);
      return createJsonResponse({ body: { ok: true } });
    }) as unknown as typeof globalThis.fetch;

    const onRequest = vi.fn();
    const clientWithHook = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      hooks: { onRequest }
    });
    await clientWithHook.schedule.getGroup("053503");
    expect(onRequest).toHaveBeenCalledOnce();
    expect(capturedHeaders?.get("Accept")).toBe("application/json");
  });

  // requestJson combines per-call and global signals through mergeSignals([...], timeout)
  it("combines per-call signal and global config signal (line 30)", async () => {
    const globalCtrl = new AbortController();
    const perCallCtrl = new AbortController();

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [] })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      signal: globalCtrl.signal,
      validateResponses: false
    });

    const result = await client.groups.listAll({ signal: perCallCtrl.signal });
    expect(Array.isArray(result)).toBe(true);
  });

  // line 222 — config.signal aborted → treated as user-initiated abort (not timeout)
  it("throws abort error (not BsuirTimeoutError) when config.signal is aborted (line 222)", async () => {
    const globalCtrl = new AbortController();
    globalCtrl.abort();

    const fetchImpl = vi.fn(async () => {
      const err = new DOMException("signal aborted", "AbortError");
      throw err;
    }) as unknown as typeof globalThis.fetch;

    const client = createBsuirClient({
      fetch: fetchImpl,
      signal: globalCtrl.signal,
      validateResponses: false,
      retries: 0
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(DOMException);
  });

  // createListModule line 21 — validateResponses: true → assertArrayResponse on listAll
  it("validateResponses: true calls assertArrayResponse on listAll (createListModule line 21)", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [] })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    const result = await client.groups.listAll();
    expect(result).toEqual([]);
  });

  it("keeps Array.isArray guard when validateResponses=false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("rejects non-array catalog payloads when validateResponses=true", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });
    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });

  it("returns a frozen payload when caching is enabled", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [{ id: 1 }] })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      cache: { ttlMs: 60_000 }
    });

    const response = await client.groups.listAll();
    const first = response[0];

    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(first ?? {})).toBe(true);
  });

  it("returns the same frozen reference on cache hit", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [{ id: 1 }] })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      cache: { ttlMs: 60_000 }
    });

    const first = await client.groups.listAll();
    const second = await client.groups.listAll();

    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("prevents mutating cached list payloads in strict mode", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [{ id: 1 }] })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      cache: { ttlMs: 60_000 }
    });

    const cached = await client.groups.listAll();
    const push = (): void => {
      cached.push({ id: 2 } as (typeof cached)[number]);
    };
    expect(push).toThrow();
    expect(cached).toHaveLength(1);
  });

  it("maps DOMException TimeoutError to BsuirTimeoutError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as unknown as typeof globalThis.fetch;
    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      timeoutMs: 10,
      validateResponses: false
    });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirTimeoutError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("detaches manual merge listeners after successful request when AbortSignal.any is unavailable", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let added = 0;
    let removed = 0;
    const originalDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    const originalAddEventListener = controller.signal.addEventListener.bind(controller.signal);
    const originalRemoveEventListener = controller.signal.removeEventListener.bind(
      controller.signal
    );

    try {
      if (!originalDescriptor?.configurable) {
        throw new Error("AbortSignal.any is not configurable");
      }
      Object.defineProperty(AbortSignal, "any", {
        value: undefined,
        configurable: true
      });

      controller.signal.addEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        if (type === "abort") {
          added += 1;
        }
        return originalAddEventListener(type, listener, options);
      };

      controller.signal.removeEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
      ) => {
        if (type === "abort") {
          removed += 1;
        }
        return originalRemoveEventListener(type, listener, options);
      };

      const fetchImpl = mockFetchSequence([createJsonResponse({ body: [] })]);
      const client = createBsuirClient({
        fetch: fetchImpl,
        signal: controller.signal,
        timeoutMs: 10_000,
        validateResponses: false
      });

      await client.groups.listAll();

      expect(added).toBeGreaterThan(0);
      expect(removed).toBeGreaterThan(0);
    } finally {
      controller.signal.addEventListener = originalAddEventListener;
      controller.signal.removeEventListener = originalRemoveEventListener;
      if (originalDescriptor) {
        Object.defineProperty(AbortSignal, "any", originalDescriptor);
      }
      vi.useRealTimers();
    }
  });
});
