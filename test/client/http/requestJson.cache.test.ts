import { describe, expect, it, vi } from "vitest";
import { createBsuirClient, type ResponseHookContext } from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";

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
});
