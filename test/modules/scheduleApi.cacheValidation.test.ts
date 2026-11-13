import { describe, expect, it, vi } from "vitest";
import {
  BsuirResponseValidationError,
  createBsuirClient,
  type ResponseCacheEntry
} from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleResponse } from "../../src/types/schedule";

function buildRawPayload(): ScheduleResponse {
  return {
    employeeDto: null,
    studentGroupDto: null,
    schedules: {},
    exams: [],
    startDate: null,
    endDate: null,
    startExamsDate: null,
    endExamsDate: null
  };
}

describe("scheduleApi cache validation", () => {
  it("validates raw schedule responses on cache miss and cache hit", async () => {
    vi.resetModules();
    const validators = await import("../../src/client/responseValidators");
    const spy = vi.spyOn(validators, "assertScheduleResponse");
    const { createBsuirClient: createClient } = await import("../../src");

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createClient({
      fetch: fetchImpl,
      validateResponses: true,
      cache: {
        ttlMs: 60_000,
        maxEntries: 10
      }
    });

    await client.schedule.getRaw({ group: "053503" });
    await client.schedule.getRaw({ group: "053503" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid hand-populated cache entry, evicts it and refetches next time", async () => {
    const store = new Map<string, ResponseCacheEntry>();
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildRawPayload() }),
      createJsonResponse({ body: buildRawPayload() })
    ]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      cache: {
        ttlMs: 60_000,
        maxEntries: 10,
        store
      }
    });

    await client.schedule.getRaw({ group: "053503" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    const [key, entry] = store.entries().next().value!;
    // Shape that fails assertScheduleResponse (schedules must be object|null|absent).
    store.set(
      key,
      Object.freeze({
        value: { schedules: "not-an-object" },
        status: entry.status,
        expiresAt: entry.expiresAt
      })
    );

    await expect(client.schedule.getRaw({ group: "053503" })).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.has(key)).toBe(false);

    await expect(client.schedule.getRaw({ group: "053503" })).resolves.toMatchObject({
      schedules: {}
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(1);
  });

  it("getCurrentWeek does not cache a junk body (e.g. a maintenance page)", async () => {
    const store = new Map<string, ResponseCacheEntry>();
    const fetchImpl = mockFetchSequence([
      new Response("<html>maintenance</html>", { headers: { "Content-Type": "text/html" } }),
      createJsonResponse({ body: 3 })
    ]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      retries: 0,
      cache: { ttlMs: 60_000, store }
    });

    await expect(client.schedule.getCurrentWeek()).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(store.size).toBe(0);
    await expect(client.schedule.getCurrentWeek()).resolves.toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("getGroup rejects poisoned cache via always-on structural validator", async () => {
    const store = new Map<string, ResponseCacheEntry>();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      cache: {
        ttlMs: 60_000,
        maxEntries: 10,
        store
      }
    });

    await client.schedule.get({ group: "053503" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    const [key, entry] = store.entries().next().value!;
    store.set(
      key,
      Object.freeze({
        value: { schedules: [] },
        status: entry.status,
        expiresAt: entry.expiresAt
      })
    );

    await expect(client.schedule.get({ group: "053503" })).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("getGroup does not cache a malformed network envelope", async () => {
    const store = new Map<string, ResponseCacheEntry>();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: { schedules: [] } })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: false,
      cache: {
        ttlMs: 60_000,
        maxEntries: 10,
        store
      }
    });

    await expect(client.schedule.get({ group: "053503" })).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(store.size).toBe(0);
  });

  // A non-object lesson row used to pass the structural guard, get cached with an
  // onResponse, and then crash normalization with a raw TypeError on every call.
  it.each([
    ["schedules", { schedules: { Понедельник: [null] } }, "'schedules.Понедельник[0]'"],
    ["nextSchedules", { nextSchedules: { Вторник: ["lesson"] } }, "'nextSchedules.Вторник[0]'"],
    ["exams", { exams: [42] }, "'exams[0]'"]
  ])(
    "rejects a non-object lesson row in %s without caching it (non-strict)",
    async (_label, patch, location) => {
      const store = new Map<string, ResponseCacheEntry>();
      const onResponse = vi.fn();
      const onError = vi.fn();
      const fetchImpl = mockFetchSequence([
        createJsonResponse({ body: { ...buildRawPayload(), ...patch } })
      ]);
      const client = createBsuirClient({
        fetch: fetchImpl,
        cache: { ttlMs: 60_000, store },
        hooks: { onResponse, onError }
      });

      const request = client.schedule.get({ group: "053503" });
      await expect(request).rejects.toBeInstanceOf(BsuirResponseValidationError);
      await expect(request).rejects.toThrow(`${location} must be a lesson object`);
      expect(store.size).toBe(0);
      expect(onResponse).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
    }
  );
});
