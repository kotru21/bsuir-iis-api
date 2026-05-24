import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../../src";
import { createJsonResponse, mockFetchSequence } from "../../helpers/fetchMock";

describe("requestJson — cache write semantics", () => {
  it("does not write cache when request fails", async () => {
    const fetchImpl = mockFetchSequence([new Error("boom"), createJsonResponse({ body: [] })]) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl, cache: { ttlMs: 1000 }, retries: 0 });

    await expect(client.groups.listAll()).rejects.toThrow();

    // Cache should be empty after failure
    expect((client as any).groups).toBeTruthy();
    // Internal responseCache is hidden; inspect via client internals by creating a new request and ensuring fetch runs again
    await expect(client.groups.listAll()).resolves.toEqual([]);
    expect((fetchImpl as any).mock.calls.length).toBe(2);
  });

  it("writes to cache on success and serves subsequent request from cache", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: [1, 2, 3] })]) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl, cache: { ttlMs: 1000 } });

    const first = await client.groups.listAll();
    expect(first).toEqual([1, 2, 3]);

    // Second call should be a cache hit and not call fetch again
    const second = await client.groups.listAll();
    expect(second).toEqual([1, 2, 3]);
    expect((fetchImpl as any).mock.calls.length).toBe(1);
  });
});
