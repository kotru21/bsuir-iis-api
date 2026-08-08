import { describe, expect, it } from "vitest";
import { createBsuirClient } from "../../src";
import { createJsonResponse, mockFetchSequence } from "../helpers/fetchMock";
import type { ScheduleItem } from "../../src/types/schedule";
import { buildNextTermMondayLesson, buildScheduleResponse } from "./scheduleFixtures";

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

  it("getGroupBySubgroup honors includeNextSchedules", async () => {
    const fetchImpl = mockFetchSequence([
      createJsonResponse({
        body: buildScheduleResponse({
          nextSchedules: buildNextTermMondayLesson()
        })
      }),
      createJsonResponse({
        body: buildScheduleResponse({
          nextSchedules: buildNextTermMondayLesson()
        })
      })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const withoutNext = await client.schedule.getGroupBySubgroup("053503", 1);
    expect(withoutNext.every((item) => item.source === "schedules")).toBe(true);

    const withNext = await client.schedule.getGroupBySubgroup("053503", 1, {
      includeNextSchedules: true
    });
    expect(withNext.some((item) => item.source === "nextSchedules")).toBe(true);
    expect(withNext.some((item) => item.subject === "NEXT")).toBe(true);
  });

  it("getGroupBySubgroupRaw/Envelope honor includeNextSchedules", async () => {
    const body = buildScheduleResponse({
      nextSchedules: buildNextTermMondayLesson()
    });
    const fetchImpl = mockFetchSequence([
      createJsonResponse({ body }),
      createJsonResponse({ body }),
      createJsonResponse({ body }),
      createJsonResponse({ body })
    ]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const rawWithout = await client.schedule.getGroupBySubgroupRaw("053503", 1);
    expect(rawWithout.some((item) => item.subject === "NEXT")).toBe(false);

    const rawWith = await client.schedule.getGroupBySubgroupRaw("053503", 1, {
      includeNextSchedules: true
    });
    expect(rawWith.some((item) => item.subject === "NEXT")).toBe(true);

    const envelopeWithout = await client.schedule.getGroupBySubgroupEnvelope("053503", 1);
    // Current-term only: nextSchedules is stripped when includeNextSchedules is not set.
    expect(envelopeWithout.nextSchedules).toBeUndefined();
    expect(envelopeWithout.schedules?.Понедельник?.some((item) => item.subject === "NEXT")).toBe(
      false
    );

    const envelopeWith = await client.schedule.getGroupBySubgroupEnvelope("053503", 1, {
      includeNextSchedules: true
    });
    expect(envelopeWith.nextSchedules?.Понедельник?.map((item) => item.subject)).toEqual(["NEXT"]);
    expect(
      envelopeWith.nextSchedules?.Понедельник?.every(
        (item) => item.numSubgroup === 0 || item.numSubgroup === 1
      )
    ).toBe(true);
  });

  it("getGroupBySubgroupEnvelope filters nextSchedules by subgroup when includeNextSchedules is true", async () => {
    const body = buildScheduleResponse({
      nextSchedules: {
        Понедельник: [
          {
            weekNumber: [1],
            studentGroups: [],
            numSubgroup: 1,
            auditories: ["200-1"],
            startLessonTime: "08:00",
            endLessonTime: "09:20",
            subject: "NEXT-1",
            subjectFullName: "Next term subgroup 1",
            note: null,
            lessonTypeAbbrev: "ЛК",
            dateLesson: null,
            startLessonDate: "01.09.2026",
            endLessonDate: "20.12.2026",
            announcement: false,
            split: false,
            employees: null
          },
          {
            weekNumber: [1],
            studentGroups: [],
            numSubgroup: 2,
            auditories: ["201-1"],
            startLessonTime: "09:30",
            endLessonTime: "10:50",
            subject: "NEXT-2",
            subjectFullName: "Next term subgroup 2",
            note: null,
            lessonTypeAbbrev: "ЛК",
            dateLesson: null,
            startLessonDate: "01.09.2026",
            endLessonDate: "20.12.2026",
            announcement: false,
            split: false,
            employees: null
          }
        ]
      }
    });
    const fetchImpl = mockFetchSequence([createJsonResponse({ body })]);
    const client = createBsuirClient({ fetch: fetchImpl });

    const envelope = await client.schedule.getGroupBySubgroupEnvelope("053503", 1, {
      includeNextSchedules: true
    });
    expect(envelope.nextSchedules?.Понедельник?.map((item) => item.subject)).toEqual(["NEXT-1"]);
  });
});
