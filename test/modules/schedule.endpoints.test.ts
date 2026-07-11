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

  it("supports last update endpoints", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body: { lastUpdateDate: "23.02.2022" } }),
      createJsonResponse({ body: { lastUpdateDate: "24.02.2022" } })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl, validateResponses: true });

    const byGroup = await client.schedule.getLastUpdateByGroup({ groupNumber: "053503" });
    const byEmployee = await client.schedule.getLastUpdateByEmployee({ id: 123 });

    expect(byGroup.lastUpdateDate).toBe("23.02.2022");
    expect(byEmployee.lastUpdateDate).toBe("24.02.2022");
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
    expect(subgroupLessons).toHaveLength(1);
    expect(subgroupLessons[0]?.numSubgroup).toBe(1);
  });

  it("supports raw subgroup helper via getGroupBySubgroupRaw", async () => {
    const fetchImpl = mockFetchSequence([createJsonResponse({ body: buildScheduleResponse() })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const subgroupLessons = await client.schedule.getGroupBySubgroupRaw("053503", 1);
    const first = subgroupLessons[0] as ScheduleItem | undefined;
    expect(subgroupLessons).toHaveLength(1);
    expect(first?.numSubgroup).toBe(1);
    expect(first && "source" in first).toBe(false);
  });
});
