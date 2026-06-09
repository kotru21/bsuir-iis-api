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
    // eslint-disable-next-line unicorn/prefer-https -- testing insecure HTTP rejection
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

  it("rejects baseUrl when explicit non-default port is provided", () => {
    expect(() =>
      createBsuirClient({
        baseUrl: "https://iis.bsuir.by:8443/api/v1"
      })
    ).toThrow(BsuirConfigurationError);
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

  it("returns raw schedule payload when using getGroupRaw", async () => {
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

    const response = await client.schedule.getGroupRaw("053503");
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
