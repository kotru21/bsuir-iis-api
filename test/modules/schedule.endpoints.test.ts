import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleItem } from "../../src/types/schedule";
import { buildScheduleResponse } from "./scheduleFixtures";

describe("schedule module — endpoints and helpers", () => {
  it("parses current week from plain-text API response", async () => {
    const fetchImpl = mockFetchSequence([
      new Response("2\n", { status: 200, headers: { "Content-Type": "text/plain" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const week = await client.schedule.getCurrentWeek();
    expect(week).toBe(2);
  });

  it("exposes exams and subgroup helper methods", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: buildScheduleResponse() }),
      createJsonResponse({ body: buildScheduleResponse() })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const exams = await client.schedule.getGroupExams("053503");
    const subgroupLessons = await client.schedule.getGroupBySubgroup("053503", 1);

    expect(exams).toHaveLength(1);
    expect(exams[0]?.source).toBe("exams");
    // Fixture: Monday numSubgroup 1 + Wednesday shared (0).
    expect(subgroupLessons).toHaveLength(2);
    expect(subgroupLessons.map((item) => item.numSubgroup).toSorted((a, b) => a - b)).toEqual([
      0, 1
    ]);
  });

  it("supports raw subgroup helper via getGroupBySubgroupRaw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const subgroupLessons = await client.schedule.getGroupBySubgroupRaw("053503", 1);
    const first = subgroupLessons.find((item) => item.numSubgroup === 1) as
      ScheduleItem | undefined;
    expect(subgroupLessons).toHaveLength(2);
    expect(subgroupLessons.map((item) => item.numSubgroup).toSorted((a, b) => a - b)).toEqual([
      0, 1
    ]);
    expect(first && "source" in first).toBe(false);
  });
});
