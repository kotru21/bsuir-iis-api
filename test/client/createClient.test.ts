import { describe, expect, it, vi } from "vitest";
import {
  BsuirConfigurationError,
  BsuirResponseValidationError,
  createBsuirClient
} from "../../src";
import { createJsonResponse } from "../helpers/fetchMock";

describe("createBsuirClient", () => {
  it("uses custom fetch implementation when provided", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({ body: 2 })) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  describe("fetch receiver (browser 'Illegal invocation')", () => {
    // Native browser / Workers fetch is a WebIDL operation on the global object: it
    // throws unless `this` is the global object or undefined.
    function createReceiverCheckingFetch(): typeof fetch {
      return function receiverCheckingFetch(this: unknown) {
        if (this !== undefined && this !== globalThis) {
          return Promise.reject(
            new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
          );
        }
        return Promise.resolve(createJsonResponse({ body: 3 }));
      } as unknown as typeof fetch;
    }

    it("calls a user-provided native-like fetch without a foreign receiver", async () => {
      const client = createBsuirClient({ fetch: createReceiverCheckingFetch(), retries: 0 });
      await expect(client.schedule.getCurrentWeek()).resolves.toBe(3);
    });

    it("calls the global fetch without a foreign receiver", async () => {
      vi.stubGlobal("fetch", createReceiverCheckingFetch());
      try {
        const client = createBsuirClient({ retries: 0 });
        await expect(client.schedule.getCurrentWeek()).resolves.toBe(3);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("rejects a non-function fetch option at construction", () => {
      expect(() => createBsuirClient({ fetch: "nope" as unknown as typeof fetch })).toThrow(
        new BsuirConfigurationError("'fetch' must be a function")
      );
    });
  });

  it("throws BsuirConfigurationError when neither custom nor global fetch is available", () => {
    vi.stubGlobal("fetch", null);
    try {
      let caught: unknown;
      try {
        createBsuirClient();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BsuirConfigurationError);
      expect((caught as Error).message).toBe(
        "Global fetch is unavailable. Provide 'fetch' in createBsuirClient options."
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws BsuirConfigurationError for invalid numeric options", () => {
    expect(() => createBsuirClient({ timeoutMs: 0 })).toThrow(BsuirConfigurationError);
    expect(() => createBsuirClient({ retries: -1 })).toThrow(BsuirConfigurationError);
    expect(() => createBsuirClient({ cache: { ttlMs: 0 } })).toThrow(BsuirConfigurationError);
    expect(() => createBsuirClient({ maxResponseBytes: 0 })).toThrow(BsuirConfigurationError);
    expect(() => createBsuirClient({ retryDelayMs: 500, retryMaxDelayMs: 100 })).toThrow(
      BsuirConfigurationError
    );
  });

  it("rejects HTTP baseUrl by default", () => {
    // oxlint-disable-next-line unicorn-js/prefer-https -- testing insecure HTTP rejection
    expect(() => createBsuirClient({ baseUrl: "http://iis.bsuir.by/api/v1" })).toThrow(
      BsuirConfigurationError
    );
  });

  it("rejects baseUrl host outside allowlist", () => {
    expect(() => createBsuirClient({ baseUrl: "https://example.com/api/v1" })).toThrow(
      BsuirConfigurationError
    );
  });

  it("allows explicit insecure localhost baseUrl for trusted local testing", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "http://localhost/api/v1",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["localhost"]
      })
    ).not.toThrow();
  });

  it("accepts an explicit port on the default host", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://iis.bsuir.by:8443/api/v1"
      })
    ).not.toThrow();
  });

  it("allows explicit ports on loopback hosts for local dev/mock servers", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "http://localhost:3000/api/v1",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["localhost"]
      })
    ).not.toThrow();
    expect(() =>
      createBsuirClient({
        baseUrl: "https://localhost:8443/api/v1",
        allowedBaseUrlHosts: ["localhost"]
      })
    ).not.toThrow();
    expect(() =>
      createBsuirClient({
        baseUrl: "http://127.0.0.1:8080",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["127.0.0.1"]
      })
    ).not.toThrow();
    expect(() =>
      createBsuirClient({
        baseUrl: "http://[::1]:8080",
        allowInsecureHttp: true,
        allowedBaseUrlHosts: ["[::1]"]
      })
    ).not.toThrow();
  });

  it("rejects a cache store without Map-compatible methods", () => {
    expect(() =>
      createBsuirClient({
        cache: {
          ttlMs: 1000,
          store: {} as never
        }
      })
    ).toThrow(BsuirConfigurationError);

    // A plain Map satisfies the CacheStore contract.
    expect(() => createBsuirClient({ cache: { ttlMs: 1000, store: new Map() } })).not.toThrow();
  });

  it("rejects unsafe userAgent header value", () => {
    expect(() =>
      createBsuirClient({
        userAgent: "sdk\r\nx-injected: 1"
      })
    ).toThrow(BsuirConfigurationError);
  });

  it("supports global cancellation signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return createJsonResponse({ body: 2 });
    }) as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl, signal: controller.signal });

    await expect(client.schedule.getCurrentWeek()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("invokes lifecycle hooks from client options", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({ body: 2 })) as unknown as typeof fetch;
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const client = createBsuirClient({
      fetch: fetchImpl,
      hooks: { onRequest, onResponse }
    });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(2);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledTimes(1);
  });

  it("does not deduplicate in-flight requests by default", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({ body: [] })
    ) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    await Promise.all([client.groups.listAll(), client.groups.listAll()]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns raw schedule payload from getRaw", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        body: {
          employeeDto: null,
          studentGroupDto: null,
          schedules: {},
          exams: [],
          startDate: null,
          endDate: null,
          startExamsDate: null,
          endExamsDate: null
        }
      })
    ) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl });

    const response = await client.schedule.getRaw({ group: "053503" });
    expect("lessons" in response).toBe(false);
  });

  it("validates response payloads when validateResponses=true", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({ body: { unexpected: true } })
    ) as unknown as typeof fetch;
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    await expect(client.groups.listAll()).rejects.toBeInstanceOf(BsuirResponseValidationError);
  });
});
