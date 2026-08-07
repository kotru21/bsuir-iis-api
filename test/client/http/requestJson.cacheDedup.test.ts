import { describe, expect, it, vi } from "vitest";
import { requestJson } from "../../../src/client/http";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";
import { createRequestJsonConfig } from "./requestJsonTestConfig";

describe("requestJson — cache and private headers", () => {
  it("returns cached GET response within ttl window", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { ok: true } })]);
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000
    });

    const first = await requestJson<{ ok: boolean }>(config, "/faculties");
    const second = await requestJson<{ ok: boolean }>(config, "/faculties");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips cache read/write when cache mode is no-store", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { value: 1 } }),
      createJsonResponse({ body: { value: 2 } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000
    });

    const first = await requestJson<{ value: number }>(config, "/faculties", { cache: "no-store" });
    const second = await requestJson<{ value: number }>(config, "/faculties");

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("bypasses cache read and refreshes cache when cache mode is reload", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { value: 1 } }),
      createJsonResponse({ body: { value: 2 } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000
    });

    const first = await requestJson<{ value: number }>(config, "/faculties");
    const second = await requestJson<{ value: number }>(config, "/faculties", { cache: "reload" });
    const third = await requestJson<{ value: number }>(config, "/faculties");

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(third.value).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("disables cache write when per-call signal is already aborted before request", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { value: 1 } })]);
    const config = createRequestJsonConfig(fetchImpl, { cacheTtlMs: 60_000 });
    const ctrl = new AbortController();
    ctrl.abort();
    await requestJson(config, "/faculties", { signal: ctrl.signal });
    expect(config.responseCache.size).toBe(0);
  });

  it("disables cache and dedup when Cookie header is present", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { value: 1 } }),
      createJsonResponse({ body: { value: 2 } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000,
      dedupeInFlight: true
    });

    const first = await requestJson<{ value: number }>(config, "/faculties", {
      headers: { Cookie: "session=a" }
    });
    const second = await requestJson<{ value: number }>(config, "/faculties", {
      headers: { Cookie: "session=a" }
    });

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(config.responseCache.size).toBe(0);
  });

  it("disables cache and dedup when Authorization header is present", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { value: 1 } }),
      createJsonResponse({ body: { value: 2 } }),
      createJsonResponse({ body: { value: 3 } }),
      createJsonResponse({ body: { value: 4 } })
    ]);
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000,
      dedupeInFlight: true
    });

    const first = await requestJson<{ value: number }>(config, "/faculties", {
      headers: { Authorization: "Bearer token-a" }
    });
    const second = await requestJson<{ value: number }>(config, "/faculties", {
      headers: { Authorization: "Bearer token-a" }
    });
    expect(first.value).toBe(1);
    expect(second.value).toBe(2);

    const thirdPromise = requestJson<{ value: number }>(config, "/faculties", {
      headers: { Authorization: "Bearer token-b" }
    });
    const fourthPromise = requestJson<{ value: number }>(config, "/faculties", {
      headers: { Authorization: "Bearer token-b" }
    });
    const [third, fourth] = await Promise.all([thirdPromise, fourthPromise]);
    expect(third.value).toBe(3);
    expect(fourth.value).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(config.responseCache.size).toBe(0);
  });
});

describe("requestJson — in-flight deduplication", () => {
  it("does not deduplicate default and no-store concurrent requests", async () => {
    const resolvers: Array<(value: Response) => void> = [];
    const fetchImpl = vi.fn(() => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      resolvers.push(resolve);
      return promise;
    }) as unknown as typeof globalThis.fetch;
    const config = createRequestJsonConfig(fetchImpl, {
      cacheTtlMs: 60_000,
      dedupeInFlight: true
    });

    const firstPromise = requestJson<{ value: number }>(config, "/faculties");
    const secondPromise = requestJson<{ value: number }>(config, "/faculties", {
      cache: "no-store"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const firstResolve = resolvers[0];
    const secondResolve = resolvers[1];
    if (!firstResolve || !secondResolve) {
      throw new Error("missing fetch resolvers");
    }
    firstResolve(createJsonResponse({ body: { value: 1 } }));
    secondResolve(createJsonResponse({ body: { value: 2 } }));
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
  });

  it("deduplicates concurrent in-flight GET requests", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(() => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      resolveFetch = resolve;
      return promise;
    }) as unknown as typeof globalThis.fetch;
    const config = createRequestJsonConfig(fetchImpl);

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

  it("does not deduplicate concurrent requests when headers differ", async () => {
    const resolvers: Array<(value: Response) => void> = [];
    const fetchImpl = vi.fn(() => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      resolvers.push(resolve);
      return promise;
    }) as unknown as typeof globalThis.fetch;
    const config = createRequestJsonConfig(fetchImpl);

    const firstPromise = requestJson<{ ok: boolean }>(config, "/faculties", {
      headers: { "Accept-Language": "ru" }
    });
    const secondPromise = requestJson<{ ok: boolean }>(config, "/faculties", {
      headers: { "Accept-Language": "en" }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);

    expect(resolvers).toHaveLength(2);
    const firstResolve = resolvers[0];
    const secondResolve = resolvers[1];
    if (!firstResolve || !secondResolve) {
      throw new Error("missing fetch resolvers");
    }
    firstResolve(createJsonResponse({ body: { ok: true } }));
    secondResolve(createJsonResponse({ body: { ok: true } }));
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("does not deduplicate GET requests when caller passes a per-call AbortSignal", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { ok: true } }),
      createJsonResponse({ body: { ok: true } })
    ]);
    const config = createRequestJsonConfig(fetchImpl);
    const signalA = new AbortController().signal;
    const signalB = new AbortController().signal;

    await Promise.all([
      requestJson<{ ok: boolean }>(config, "/faculties", { signal: signalA }),
      requestJson<{ ok: boolean }>(config, "/faculties", { signal: signalB })
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
