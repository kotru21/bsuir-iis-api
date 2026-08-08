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

    await client.schedule.getGroupRaw("053503");
    await client.schedule.getGroupRaw("053503");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid hand-populated cache entry without refetching", async () => {
    const store = new Map<string, ResponseCacheEntry>();
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
      fetch: fetchImpl,
      validateResponses: true,
      cache: {
        ttlMs: 60_000,
        maxEntries: 10,
        store
      }
    });

    await client.schedule.getGroupRaw("053503");
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

    await expect(client.schedule.getGroupRaw("053503")).rejects.toBeInstanceOf(
      BsuirResponseValidationError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
