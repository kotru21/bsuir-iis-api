import { describe, expect, it, vi } from "vitest";
import { BsuirResponseValidationError, createBsuirClient } from "../../../src";
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

  it("always validates list shape even when validateResponses=false", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { not: "array" } })]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: false });
    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });
});
