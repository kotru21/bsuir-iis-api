import { describe, expect, it, vi } from "vitest";
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
  it("validates raw schedule responses only on cache miss", async () => {
    vi.resetModules();
    const validators = await import("../../src/client/responseValidators");
    const spy = vi.spyOn(validators, "assertScheduleResponse");
    const { createBsuirClient } = await import("../../src");

    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildRawPayload() })]);
    const client = createBsuirClient({
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
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
