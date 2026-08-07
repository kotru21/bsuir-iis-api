import { describe, expect, it, vi } from "vitest";
import {
  createBsuirClient,
  type CacheStore,
  type ResponseCacheEntry,
  type ResponseHookContext
} from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";

/** Minimal Map-backed store with instrumentation, proving the duck-typed contract. */
class RecordingStore implements CacheStore {
  readonly data = new Map<string, ResponseCacheEntry>();
  reads = 0;
  writes = 0;
  deletes = 0;

  get size(): number {
    return this.data.size;
  }

  get(key: string): ResponseCacheEntry | undefined {
    this.reads += 1;
    return this.data.get(key);
  }

  set(key: string, entry: ResponseCacheEntry): void {
    this.writes += 1;
    this.data.set(key, entry);
  }

  delete(key: string): void {
    this.deletes += 1;
    this.data.delete(key);
  }

  keys(): Iterable<string> {
    return this.data.keys();
  }

  entries(): Iterable<[string, ResponseCacheEntry]> {
    return this.data.entries();
  }
}

describe("requestJson — cache write semantics", () => {
  it("does not write cache when request fails", async () => {
    const fetchImpl = mockFetchSequence([new Error("boom"), createJsonResponse({ body: [] })]);
    const client = createBsuirClient({ fetch: fetchImpl, cache: { ttlMs: 1000 }, retries: 0 });

    await expect(client.groups.listAll()).rejects.toThrow();

    // Internal responseCache is hidden; inspect via client internals by creating a new request and ensuring fetch runs again
    await expect(client.groups.listAll()).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("writes to cache on success and serves subsequent request from cache", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [1, 2, 3] })]);
    const client = createBsuirClient({ fetch: fetchImpl, cache: { ttlMs: 1000 } });

    const first = await client.groups.listAll();
    expect(first).toEqual([1, 2, 3]);

    // Second call should be a cache hit and not call fetch again
    const second = await client.groups.listAll();
    expect(second).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports the original response status (not a hardcoded 200) on cache hits", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ status: 201, body: [1] })]);
    const contexts: ResponseHookContext[] = [];
    const client = createBsuirClient({
      fetch: fetchImpl,
      cache: { ttlMs: 1000 },
      hooks: {
        onResponse: vi.fn((ctx: ResponseHookContext) => {
          contexts.push(ctx);
        })
      }
    });

    await client.groups.listAll();
    await client.groups.listAll();

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toMatchObject({ status: 201, fromCache: false });
    expect(contexts[1]).toMatchObject({ status: 201, fromCache: true });
  });

  it("uses a custom pluggable cache store for reads and writes", async () => {
    const store = new RecordingStore();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: ["053503"] })]);
    const client = createBsuirClient({ fetch: fetchImpl, cache: { ttlMs: 1000, store } });

    await client.groups.listAll();
    expect(store.writes).toBe(1);
    expect(store.size).toBe(1);

    // Second call must be served from the custom store without another fetch.
    const second = await client.groups.listAll();
    expect(second).toEqual(["053503"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.reads).toBe(2);
  });

  it("shares entries between client instances backed by the same store", async () => {
    const store = new RecordingStore();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: ["053503"] })]);
    const options = { fetch: fetchImpl, cache: { ttlMs: 1000, store } };
    const first = createBsuirClient(options);
    const second = createBsuirClient(options);

    await first.groups.listAll();
    const result = await second.groups.listAll();

    expect(result).toEqual(["053503"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
